/*Copyright 2019 Kirk McDonald

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/
import {Formatter} from "./align.js"
import {displayItems, renderError} from "./display.js"
import {formatSettings} from "./fragment.js"
import {Rational, zero, one} from "./rational.js"
import {BuildTarget} from "./target.js"
import {InfeasibleError, Totals, solve} from "./totals.js"
import {renderTotals} from "./visualize.js"

const DEFAULT_ITEM_KEY = "iron_ingot"

export let DEFAULT_GRAPH_SCALE = 1
export let DEFAULT_BELT = "belt1"
export let DEFAULT_BELT_STACK = 1
// Categories whose building comes from the mining settings instead.
export let MINING_CATEGORIES = new Set(["mineral", "oil", "water"])

// URL setting holding the building chosen for a category. Assemblers and
// smelters keep the names older links use.
export function buildingSettingName(category) {
    return {crafting: "assembler", smelting: "smelter"}[category] || category
}
export let DEFAULT_MINER = "miner-mk1"
export let DEFAULT_MINING_SPEED = Rational.from_float(1)
export let DEFAULT_VEINS_PER_MINER = Rational.from_float(6)
export let DEFAULT_VEINS_UTILIZATION = 0

class MiningSettings {
    constructor() {
        // Mining machine used for ore veins.
        this.miner = null
        // Advanced mining machine speed slider, from 1 to 3.
        this.speed = DEFAULT_MINING_SPEED
        // Only used to estimate how many mining machines draw power.
        this.veinsPerMiner = DEFAULT_VEINS_PER_MINER
        // Veins Utilization research level; each adds 10% mining speed.
        this.utilization = DEFAULT_VEINS_UTILIZATION
        // Crude oil per second from one seep, before research.
        this.oilSeep = null
        // Map gas giant recipe to {item: base yield per second} when changed
        // from the recipe's defaults.
        this.giantYields = new Map()
    }

    getUtilizationFactor() {
        return one.add(Rational.from_float(this.utilization).div(Rational.from_float(10)))
    }
}

class FactorySpecification {
    constructor() {
        // Game data definitions
        this.items = null
        this.recipes = null
        this.buildings = null
        this.belts = null

        // Every item, in the order of the game's replicator grid.
        this.pickerItems = []

        this.buildTargets = []

        this.mining = new MiningSettings()


        // Map item to recipe
        this.altRecipes = new Map()

        // Multiplier for the graph's height.
        this.graphScale = DEFAULT_GRAPH_SCALE

        this.belt = null
        // Items per stack on the belt, from 1 to 4.
        this.beltStack = DEFAULT_BELT_STACK

        // Map category to the building chosen for it.
        this.buildingChoice = new Map()
        this.ignore = new Set()


        this.format = new Formatter()
    }

    setData(items, recipes, buildings, belts) {
        this.items = items
        let cell = item => (item.grid[0] * 100 + item.grid[1]) * 100 + item.grid[2]
        this.pickerItems = [...items.values()].sort((a, b) => cell(a) - cell(b))
        this.recipes = recipes
        this.buildings = new Map()
        for (let building of buildings) {
            let category = this.buildings.get(building.category)
            if (category === undefined) {
                category = []
                this.buildings.set(building.category, category)
            }
            category.push(building)
        }
        this.belts = belts
        this.belt = belts.get(DEFAULT_BELT)
    }

    // The oil extractor's data rate is the seep yield to assume by default.
    getDefaultOilSeep() {
        return this.buildings.get("oil")[0].baseRate
    }

    getRecipe(item) {
        // TODO: Alternate recipes.
        let recipe = this.altRecipes.get(item)
        if (recipe === undefined) {
            return item.recipes[0]
        } else {
            return recipe
        }
    }

    // A recipe with several products may be chosen for each of them, so the
    // item is given explicitly.
    setRecipe(item, recipe) {
        if (recipe === item.recipes[0]) {
            this.altRecipes.delete(item)
        } else {
            this.altRecipes.set(item, recipe)
        }
    }


    getBuilding(recipe) {
        if (recipe.category === null) {
            return null
        } else if (recipe.category === "mineral") {
            return this.mining.miner
        }
        return this.getCategoryBuilding(recipe.category)
    }

    getCategoryBuilding(category) {
        return this.buildingChoice.get(category) || this.buildings.get(category)[0]
    }

    // Categories with more than one building to choose from.
    getChoosableCategories() {
        return [...this.buildings].filter(([category, buildings]) =>
            !MINING_CATEGORIES.has(category) && buildings.length > 1)
    }

    // Returns the recipe-rate at which a single building can produce a recipe.
    // Returns null for recipes that do not have a building.
    getRecipeRate(recipe) {
        let building = this.getBuilding(recipe)
        if (building === null) {
            return null
        }
        return building.getRecipeRate(this, recipe)
    }

    getCount(recipe, rate) {
        let building = this.getBuilding(recipe)
        if (building === null) {
            return zero
        }
        return building.getCount(this, recipe, rate)
    }

    // Items per second one belt carries.
    getBeltRate() {
        return this.belt.rate.mul(Rational.from_float(this.beltStack))
    }

    getBeltCount(rate) {
        return rate.div(this.getBeltRate())
    }

    getPowerUsage(recipe, rate, itemCount) {
        let building = this.getBuilding(recipe)
        if (building === null || this.ignore.has(recipe)) {
            return {average: zero, peak: zero}
        }
        let count = building.getMachineCount(this, this.getCount(recipe, rate))
        let power = building.getPower(this)
        let average = power.mul(count)
        let peak = power.mul(count.ceil())
        return {average, peak}
    }

    addTarget(itemKey) {
        if (itemKey === undefined) {
            itemKey = DEFAULT_ITEM_KEY
        }
        let item = this.items.get(itemKey)
        let target = new BuildTarget(this.buildTargets.length, itemKey, item, this.pickerItems)
        this.buildTargets.push(target)
        d3.select("#targets").insert(() => target.element, "#plusButton")
        return target
    }

    removeTarget(target) {
        this.buildTargets.splice(target.index, 1)
        for (let i = target.index; i < this.buildTargets.length; i++) {
            this.buildTargets[i].index--
        }
        d3.select(target.element).remove()
    }

    toggleIgnore(recipe) {
        if (this.ignore.has(recipe)) {
            this.ignore.delete(recipe)
        } else {
            this.ignore.add(recipe)
        }
    }

    solve() {
        let demand = new Map()
        for (let target of this.buildTargets) {
            demand.set(target.item, (demand.get(target.item) || zero).add(target.getRate()))
        }
        return solve(this, demand, this.ignore)
    }

    setHash() {
        window.location.hash = "#" + formatSettings()
    }

    // Orbital collector yields depend on the mining settings.
    updateCollectorYields() {
        for (let recipe of this.recipes.values()) {
            if (recipe.category === "orbital") {
                this.getCategoryBuilding("orbital").updateYields(this, recipe)
            }
        }
    }

    updateSolution() {
        this.updateCollectorYields()
        let totals
        try {
            totals = this.solve()
            renderError(null)
        } catch (e) {
            if (!(e instanceof InfeasibleError)) {
                throw e
            }
            renderError(e.items)
            totals = new Totals()
        }
        displayItems(this, totals, this.ignore)
        renderTotals(totals, this.buildTargets, this.ignore)
        this.setHash()
    }
}

export let spec = new FactorySpecification()
window.spec = spec
