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
import {DEFAULT_RATE, DEFAULT_RATE_PRECISION, DEFAULT_COUNT_PRECISION, longRateNames} from "./align.js"
import {dropdown} from "./dropdown.js"
import {DEFAULT_TAB, clickTab} from "./events.js"
import {spec, buildingSettingName, DEFAULT_GRAPH_SCALE, DEFAULT_BELT, DEFAULT_BELT_STACK, DEFAULT_MINER, DEFAULT_MINING_SPEED, DEFAULT_VEINS_PER_MINER, DEFAULT_VEINS_UTILIZATION} from "./factory.js"
import {LANGUAGES, getLanguage, nameOf, rateUnit, saveLanguage, t} from "./i18n.js"
import {Rational, zero} from "./rational.js"

// There are several things going on with this control flow. Settings should
// work like this:
// 1) Settings are parsed from the URL fragment into the settings Map.
// 2) Each setting's `render` function is called.
// 3) If the setting is not present in the map, a default value is used.
// 4) The setting is applied.
// 5) The setting's GUI is placed into a consistent state.
// Remember to add the setting to fragment.js, too!

// tab

function renderTab(settings) {
    let tabName = DEFAULT_TAB
    if (settings.has("tab")) {
        tabName = settings.get("tab")
    }
    clickTab(tabName)
}

// build targets

function renderTargets(settings) {
    spec.buildTargets = []
    d3.selectAll("#targets li.target").remove()

    let targetSetting = settings.get("items")
    if (targetSetting !== undefined && targetSetting !== "") {
        let targets = targetSetting.split(",")
        for (let targetString of targets) {
            let parts = targetString.split(":")
            let itemKey = parts[0]
            let target = spec.addTarget(itemKey)
            let type = parts[1]
            if (type === "f") {
                target.setBuildings(parts[2])
            } else if (type === "r") {
                target.setRate(parts[2])
            } else {
                throw new Error("unknown target type")
            }
        }
    } else {
        spec.addTarget()
    }
}

// Recipe keys from older links, mapped to [recipe key, product key]: recipes
// with several products used to be split into one recipe per product.
const LEGACY_RECIPES = new Map([
    ["hydrogen+refined_oil1", ["plasma_refining", "hydrogen"]],
    ["hydrogen+refined_oil2", ["plasma_refining", "refined_oil"]],
    ["refined_oil+coal", ["reforming_refine", "refined_oil"]],
    ["graphene+hydrogen1", ["graphene_fire_ice", "graphene"]],
    ["graphene+hydrogen2", ["graphene_fire_ice", "hydrogen"]],
    ["hydrogen+energetic_graphite1", ["x_ray_cracking", "hydrogen"]],
    ["hydrogen+energetic_graphite2", ["x_ray_cracking", "energetic_graphite"]],
    ["antimatter+hydrogen1", ["antimatter", "antimatter"]],
    ["antimatter+hydrogen2", ["antimatter", "hydrogen"]],
    // These used separate "vein" items, now plain mining.
    ["titanium_crystal_alt", ["organic_crystal_vein", "organic_crystal"]],
    ["high-purity_silicon_alt", ["silicon_ore", "silicon_ore"]],
])

function getRecipe(key) {
    if (LEGACY_RECIPES.has(key)) {
        key = LEGACY_RECIPES.get(key)[0]
    }
    return spec.recipes.get(key)
}

// ignore

function renderIgnore(settings) {
    spec.ignore.clear()
    // UI will be rendered later, as part of the solution.
    let ignoreSetting = settings.get("ignore")
    if (ignoreSetting !== undefined && ignoreSetting !== "") {
        let ignore = ignoreSetting.split(",")
        for (let recipeKey of ignore) {
            let recipe = getRecipe(recipeKey)
            if (recipe !== undefined) {
                spec.ignore.add(recipe)
            }
        }
    }
}

// display rate

function rateHandler() {
    spec.format.setDisplayRate(this.value)
    spec.updateSolution()
}

function renderRateOptions(settings) {
    let rateName = DEFAULT_RATE
    if (settings.has("rate")) {
        rateName = settings.get("rate")
    }
    spec.format.setDisplayRate(rateName)
    let rates = []
    for (let [rateName, longRateName] of longRateNames) {
        rates.push({rateName, longRateName})
    }
    let form = d3.select("#display_rate")
    form.selectAll("*").remove()
    let rateOption = form.selectAll("span")
        .data(rates)
        .join("span")
    rateOption.append("input")
        .attr("id", d => d.rateName + "_rate")
        .attr("type", "radio")
        .attr("name", "rate")
        .attr("value", d => d.rateName)
        .attr("checked", d => d.rateName === rateName ? "" : null)
        .on("change", rateHandler)
    rateOption.append("label")
        .attr("for", d => d.rateName + "_rate")
        .text(d => t("items/" + d.longRateName))
    rateOption.append("br")
}

// precisions

function renderPrecisions(settings) {
    spec.format.ratePrecision = DEFAULT_RATE_PRECISION
    if (settings.has("rp")) {
        spec.format.ratePrecision = Number(settings.get("rp"))
    }
    d3.select("#rprec").attr("value", spec.format.ratePrecision)
    spec.format.countPrecision = DEFAULT_COUNT_PRECISION
    if (settings.has("cp")) {
        spec.format.countPrecision = Number(settings.get("cp"))
    }
    d3.select("#cprec").attr("value", spec.format.countPrecision)
}

// Fills `container` with a row of icon radio buttons, one per option.
function renderIconSelector(container, name, options, selected, handler) {
    container.selectAll("*").remove()
    let option = container.selectAll("span")
        .data(options)
        .join("span")
    option.append("input")
        .attr("id", d => name + "." + d.key)
        .attr("type", "radio")
        .attr("name", name)
        .attr("value", d => d.key)
        .attr("checked", d => d === selected ? "" : null)
        .on("change", handler)
    option.append("label")
        .attr("for", d => name + "." + d.key)
        .append("img")
        .classed("icon", true)
        .attr("src", d => d.iconPath())
        .attr("width", 32)
        .attr("height", 32)
        .attr("title", d => nameOf(d))
}

// graph height

const MAX_GRAPH_SCALE = 10

function renderGraphScale(settings) {
    let scale = Number(settings.get("gh"))
    spec.graphScale = scale >= 0.5 && scale <= MAX_GRAPH_SCALE ? scale : DEFAULT_GRAPH_SCALE
    d3.select("#graph_scale")
        .property("value", spec.graphScale)
        .on("change", function() {
            let x = Number(this.value)
            if (this.value !== "" && Number.isFinite(x)) {
                spec.graphScale = Math.min(MAX_GRAPH_SCALE, Math.max(0.5, x))
                spec.updateSolution()
            }
            this.value = spec.graphScale
        })
}

// belt

function beltHandler(belt) {
    spec.belt = belt
    spec.updateSolution()
}

function renderBelts(settings) {
    let beltKey = DEFAULT_BELT
    if (settings.has("belt")) {
        beltKey = settings.get("belt")
    }
    spec.belt = spec.belts.get(beltKey) || spec.belts.get(DEFAULT_BELT)
    renderIconSelector(d3.select("#belt_selector"), "belt", [...spec.belts.values()], spec.belt, beltHandler)

    let stack = Math.floor(Number(settings.get("stack")))
    spec.beltStack = stack >= 1 && stack <= 4 ? stack : DEFAULT_BELT_STACK
    d3.select("#belt_stack")
        .property("value", spec.beltStack)
        .on("change", function() {
            let x = Math.floor(Number(this.value))
            if (this.value !== "" && x >= 1) {
                spec.beltStack = Math.min(4, x)
                spec.updateSolution()
            }
            this.value = spec.beltStack
        })
}

// buildings

const CATEGORY_LABELS = new Map([
    ["crafting", "Assembling machine:"],
    ["smelting", "Smelting:"],
    ["chemical_plant", "Chemical plant:"],
    ["matrix_lab", "Research:"],
])

function renderBuildingChoices(settings) {
    spec.buildingChoice = new Map()
    let categories = spec.getChoosableCategories()
    for (let [category, buildings] of categories) {
        let key = settings.get(buildingSettingName(category))
        let building = buildings.find(building => building.key === key)
        if (building !== undefined) {
            spec.buildingChoice.set(category, building)
        }
    }

    let tbody = d3.select("#building_settings")
    tbody.selectAll("*").remove()
    let row = tbody.selectAll("tr")
        .data(categories)
        .join("tr")
            .classed("setting-row", true)
    row.append("td")
        .classed("setting-label", true)
        .text(([category]) => t(CATEGORY_LABELS.get(category) || category + ":"))
    row.append("td")
        .append("span")
            .classed("icon-selector", true)
            .each(function([category, buildings]) {
                renderIconSelector(d3.select(this), "building-" + category, buildings,
                    spec.getCategoryBuilding(category), building => {
                        spec.buildingChoice.set(category, building)
                        spec.updateSolution()
                    })
            })
}

// alternate recipes

function changeAltRecipe(d) {
    spec.setRecipe(d.item, d.recipe)
    spec.updateSolution()
}

function renderIngredient(ingSpan) {
    ingSpan.classed("ingredient", true)
        .attr("title", d => nameOf(d.item))
        .append("img")
        .classed("icon", true)
        .attr("src", d => d.item.iconPath())
    ingSpan.append("span")
        .classed("count", true)
        .text(d => spec.format.count(d.amount))
}

function renderAltRecipes(settings) {
    spec.altRecipes = new Map()
    if (settings.has("alt")) {
        let alt = settings.get("alt").split(",")
        for (let entry of alt) {
            let [itemKey, recipeKey] = entry.split(":")
            let item = spec.items.get(itemKey)
            let recipe = spec.recipes.get(recipeKey)
            if (recipeKey === undefined) {
                // Old links save just the recipe key.
                if (LEGACY_RECIPES.has(entry)) {
                    [recipeKey, itemKey] = LEGACY_RECIPES.get(entry)
                    item = spec.items.get(itemKey)
                    recipe = spec.recipes.get(recipeKey)
                } else {
                    recipe = spec.recipes.get(entry)
                    item = recipe && recipe.product.item
                    // A default recipe is never saved as "alt", so this is a
                    // link from before alternate recipes got their own keys:
                    // it meant the last one.
                    if (item && recipe === item.recipes[0]) {
                        recipe = item.recipes[item.recipes.length - 1]
                    }
                }
            }
            if (item === undefined || recipe === undefined || recipe.gives(item) === null) {
                continue
            }
            spec.setRecipe(item, recipe)
        }
    }

    let items = spec.pickerItems.filter(item => item.recipes.length > 1)

    let div = d3.select("#alt_recipe_settings")
    div.selectAll("*").remove()

    let dropdowns = div.selectAll("div")
        .data(items)
        .enter().append("div")
    let recipeLabel = dropdown(
        dropdowns,
        item => item.recipes.map(recipe => ({item, recipe})),
        d => `altrecipe-${d.item.key}`,
        d => spec.getRecipe(d.item) === d.recipe,
        changeAltRecipe,
    )
    recipeLabel.attr("title", d => nameOf(d.recipe))

    let productSpan = recipeLabel.append("span")
        .selectAll("span")
        .data(d => d.recipe.products)
        .join("span")
    renderIngredient(productSpan)
    recipeLabel.append("span")
        .classed("arrow", true)
        .text("\u21d0")
    let ingredientSpan = recipeLabel.append("span")
        .selectAll("span")
        .data(d => d.recipe.ingredients)
        .join("span")
    renderIngredient(ingredientSpan)
}

// mining

function minerHandler(miner) {
    spec.mining.miner = miner
    spec.updateSolution()
}

// Binds a number input to a mining setting. `show` gives the setting's text;
// `parse` turns the input's text into the setting's value, or returns null to
// reject it. The input always ends up showing the value actually in use.
function bindMiningInput(id, show, parse, apply) {
    d3.select("#" + id)
        .property("value", show())
        .on("change", function() {
            let parsed = parse(this.value)
            if (parsed !== null) {
                apply(parsed)
                spec.updateSolution()
            }
            this.value = show()
        })
}

function parseNonNegative(s) {
    s = String(s).trim()
    return /^\d+(\.\d+)?$/.test(s) ? Rational.from_string(s) : null
}

function parsePositive(s) {
    s = String(s).trim()
    if (!/^\d+(\.\d+)?$/.test(s)) {
        return null
    }
    let x = Rational.from_string(s)
    return zero.less(x) ? x : null
}

function renderMining(settings) {
    let mining = spec.mining
    let minerKey = settings.has("miner") ? settings.get("miner") : DEFAULT_MINER
    let miners = spec.buildings.get("mineral")
    mining.miner = miners.find(miner => miner.key === minerKey) || miners[0]

    let hundred = Rational.from_float(100)
    mining.speed = settings.has("mspeed")
        ? (parsePositive(settings.get("mspeed")) || hundred).div(hundred)
        : DEFAULT_MINING_SPEED
    mining.veinsPerMiner = settings.has("vpm")
        ? parsePositive(settings.get("vpm")) || DEFAULT_VEINS_PER_MINER
        : DEFAULT_VEINS_PER_MINER
    mining.utilization = settings.has("vu")
        ? Math.max(0, Math.floor(Number(settings.get("vu"))) || 0)
        : DEFAULT_VEINS_UTILIZATION
    mining.oilSeep = settings.has("seep")
        ? parsePositive(settings.get("seep")) || spec.getDefaultOilSeep()
        : spec.getDefaultOilSeep()

    renderIconSelector(d3.select("#miner_selector"), "miner", miners, mining.miner, minerHandler)
    d3.select("#oil_seep_unit").text("/" + rateUnit("s"))

    bindMiningInput("mining_speed", () => mining.speed.mul(hundred).toDecimal(6), s => {
        let x = Number(s)
        if (s === "" || !Number.isFinite(x)) {
            return null
        }
        return Rational.from_float(Math.min(300, Math.max(100, Math.round(x)))).div(hundred)
    }, x => mining.speed = x)
    bindMiningInput("veins_per_miner", () => mining.veinsPerMiner.toDecimal(6), parsePositive,
        x => mining.veinsPerMiner = x)
    bindMiningInput("veins_utilization", () => mining.utilization, s => {
        let x = Number(s)
        return s !== "" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null
    }, x => mining.utilization = x)
    bindMiningInput("oil_seep", () => mining.oilSeep.toDecimal(6), parsePositive,
        x => mining.oilSeep = x)

    renderGiants(settings)
}

// Gas giants: one row per kind, with an input for each gas's base yield.
function renderGiants(settings) {
    let mining = spec.mining
    let giants = [...spec.recipes.values()].filter(recipe => recipe.category === "orbital")
    mining.giantYields = new Map()
    for (let giant of giants) {
        let values = (settings.get(giant.key) || "").split(",")
        let yields = new Map()
        giant.products.forEach((product, i) => {
            let value = values[i] === undefined ? null : parseNonNegative(values[i])
            yields.set(product.item, value === null ? giant.defaultYields.get(product.item) : value)
        })
        mining.giantYields.set(giant, yields)
    }

    let tbody = d3.select("#giant_settings")
    tbody.selectAll("*").remove()
    let row = tbody.selectAll("tr")
        .data(giants)
        .join("tr")
            .classed("setting-row", true)
    row.append("td")
        .classed("setting-label", true)
        .attr("title", t("Base yield shown on the planet. Each orbital collector gathers 8 times that, plus research, and burns part of it as fuel."))
        .text(giant => nameOf(giant) + ":")
    let gas = row.append("td")
        .selectAll("span")
        .data(giant => giant.products.map(product => ({giant, item: product.item})))
        .join("span")
            .classed("giant-yield", true)
    gas.append("img")
        .classed("icon", true)
        .attr("src", d => d.item.iconPath())
        .attr("width", 24)
        .attr("height", 24)
        .attr("title", d => nameOf(d.item))
    gas.append("input")
        .classed("prec", true)
        .attr("type", "number")
        .attr("min", 0)
        .attr("step", 0.01)
        .property("value", d => mining.giantYields.get(d.giant).get(d.item).toDecimal(6))
        .on("change", function(d) {
            let yields = mining.giantYields.get(d.giant)
            let value = parseNonNegative(this.value)
            if (value !== null) {
                yields.set(d.item, value)
                spec.updateSolution()
            }
            this.value = yields.get(d.item).toDecimal(6)
        })
    gas.append("span")
        .text(" /" + rateUnit("s") + " ")
}


// language

// Switching language reloads the page, which re-renders everything in it.
function renderLanguage() {
    d3.select("#language_selector").selectAll("*").remove()
    d3.select("#language_selector")
        .append("select")
            .on("change", function() {
                saveLanguage(this.value)
                location.reload()
            })
        .selectAll("option")
        .data([...LANGUAGES])
        .join("option")
            .attr("value", ([lang]) => lang)
            .property("selected", ([lang]) => lang === getLanguage())
            .text(([lang, name]) => name)
}

export function renderSettings(settings) {
    renderLanguage()
    renderTargets(settings)
    renderIgnore(settings)
    renderRateOptions(settings)
    renderPrecisions(settings)
    renderGraphScale(settings)
    renderBelts(settings)
    renderBuildingChoices(settings)
    renderMining(settings)
    renderAltRecipes(settings)
    renderTab(settings)
}
