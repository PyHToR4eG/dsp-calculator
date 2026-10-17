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
import {Rational, zero, one} from "./rational.js"

export class Totals {
    constructor() {
        // Map recipe to how many times per second it runs.
        this.rates = new Map()
        // Map recipe to its distance from the outputs, for the graph layout.
        this.heights = new Map()
        // Recipes ordered from the outputs down to the raw resources.
        this.topo = []
        // Map item to the rate produced beyond what is needed (byproducts).
        this.surplus = new Map()
    }
}

// Thrown when the chosen recipes can't make the targets. `items` are those
// whose chosen recipes need each other with no outside source, e.g. refined
// oil by reforming (which uses hydrogen) and hydrogen by X-ray cracking (which
// uses refined oil).
export class InfeasibleError extends Error {
    constructor(items) {
        super("the production targets can't be met with the chosen recipes")
        this.items = items
    }
}

// Recipes with several products (plasma refining gives both refined oil and
// hydrogen) can't be solved by walking the recipe tree, so the factory is
// solved as a linear program over recipe rates x >= 0 and surpluses s >= 0:
//
//     minimize   cost·x + SURPLUS_COST·sum(s)
//     subject to A x - s = demand
//
// where A[item][recipe] is the net amount of the item made by one run.
//
// Its dual, maximize demand·y subject to A^T y <= cost and -y <= SURPLUS_COST
// with y free, has the origin as a feasible start because all costs are
// non-negative, so plain simplex on the dual needs no phase one. The primal
// solution is then read off the final objective row as the slack variables'
// reduced costs.

// Costs, from most to least important: raw resources, then surplus, then
// making items with recipes not chosen for them, then recipe runs. Mined
// resources cost 1 per item; raw items that can't be mined (critical photons,
// logs, Dark Fog drops) are scarce and cost 100, so that e.g. hydrogen isn't
// taken from antimatter production. The surplus cost keeps recipes from being
// overrun just for a byproduct. Between equally good options, the off-choice
// cost prefers the recipe chosen for an item over another recipe that also
// makes it, and the token recipe cost keeps unneeded recipes idle.
const MINED_COST = one
const SCARCE_COST = Rational.from_float(100)
const SURPLUS_COST = one.div(Rational.from_float(100))
const OFF_CHOICE_COST = one.div(Rational.from_float(1000))
const RECIPE_COST = one.div(Rational.from_float(10000))

function recipeCost(spec, recipe, ignore) {
    let made = recipe.products.reduce((sum, product) => sum.add(product.amount), zero)
    // Ignored recipes are supplied from elsewhere, like a mined resource.
    if (ignore.has(recipe)) {
        return MINED_COST.mul(made)
    }
    if (recipe.ingredients.length === 0) {
        return (recipe.category === null ? SCARCE_COST : MINED_COST).mul(made)
    }
    let cost = RECIPE_COST
    for (let product of recipe.products) {
        if (spec.getRecipe(product.item) !== recipe) {
            cost = cost.add(OFF_CHOICE_COST.mul(product.amount))
        }
    }
    return cost
}

// The chosen recipe of every item needed for the demand.
function activeRecipes(spec, demand, ignore) {
    let recipes = []
    let seen = new Set()
    let queue = [...demand.keys()]
    let queued = new Set(queue)
    while (queue.length > 0) {
        let recipe = spec.getRecipe(queue.shift())
        if (seen.has(recipe)) {
            continue
        }
        seen.add(recipe)
        recipes.push(recipe)
        if (ignore.has(recipe)) {
            continue
        }
        for (let ing of recipe.ingredients) {
            if (!queued.has(ing.item)) {
                queued.add(ing.item)
                queue.push(ing.item)
            }
        }
    }
    return recipes
}

// Net amount of each item made by one run of the recipe. Ignored recipes are
// treated as free sources: their inputs are supplied from elsewhere.
function netAmounts(recipe, ignore) {
    let net = new Map()
    for (let product of recipe.products) {
        net.set(product.item, product.amount)
    }
    if (!ignore.has(recipe)) {
        for (let ing of recipe.ingredients) {
            net.set(ing.item, (net.get(ing.item) || zero).sub(ing.amount))
        }
    }
    return net
}

// Maximizes p·v subject to M v <= h, v >= 0, where h >= 0. Returns the
// reduced costs of the slack variables, which solve the dual problem. Uses
// Bland's rule, so it can't cycle.
function simplex(M, h, p) {
    let rowCount = M.length
    let width = p.length + rowCount
    let rows = M.map((row, r) => row.concat(h.map((v, s) => s === r ? one : zero), [h[r]]))
    let basis = rows.map((row, r) => p.length + r)
    let objective = p.map(v => zero.sub(v)).concat(new Array(rowCount + 1).fill(zero))
    for (;;) {
        let col = objective.findIndex((v, j) => j < width && v.less(zero))
        if (col === -1) {
            break
        }
        let pivot = -1
        let best = null
        for (let r = 0; r < rowCount; r++) {
            let a = rows[r][col]
            if (!zero.less(a)) {
                continue
            }
            let ratio = rows[r][width].div(a)
            if (pivot === -1 || ratio.less(best) || (ratio.equal(best) && basis[r] < basis[pivot])) {
                pivot = r
                best = ratio
            }
        }
        if (pivot === -1) {
            throw new InfeasibleError([])
        }
        let pivotRow = rows[pivot]
        let pivotValue = pivotRow[col]
        for (let j = 0; j <= width; j++) {
            pivotRow[j] = pivotRow[j].div(pivotValue)
        }
        for (let row of rows.concat([objective])) {
            let factor = row[col]
            if (row === pivotRow || factor.isZero()) {
                continue
            }
            for (let j = 0; j <= width; j++) {
                if (!pivotRow[j].isZero()) {
                    row[j] = row[j].sub(factor.mul(pivotRow[j]))
                }
            }
        }
        basis[pivot] = col
    }
    return objective.slice(p.length, width)
}

// Items whose chosen recipe, followed through ingredients, needs the item
// itself.
function cyclicItems(spec, demand, ignore) {
    let needs = item => {
        let recipe = spec.getRecipe(item)
        return ignore.has(recipe) ? [] : recipe.ingredients.map(ing => ing.item)
    }
    let reachable = new Map()
    let reach = start => {
        let seen = new Set()
        let stack = needs(start)
        while (stack.length > 0) {
            let item = stack.pop()
            if (!seen.has(item)) {
                seen.add(item)
                stack.push(...needs(item))
            }
        }
        return seen
    }
    let items = new Set(demand.keys())
    for (let item of demand.keys()) {
        for (let needed of reach(item)) {
            items.add(needed)
        }
    }
    return [...items].filter(item => {
        if (!reachable.has(item)) {
            reachable.set(item, reach(item))
        }
        return reachable.get(item).has(item)
    })
}

// Longest distance (in recipes) from each recipe to the outputs.
function computeHeights(totals, demand, ignore) {
    let producers = new Map()
    for (let recipe of totals.rates.keys()) {
        for (let product of recipe.products) {
            if (!producers.has(product.item)) {
                producers.set(product.item, [])
            }
            producers.get(product.item).push(recipe)
        }
    }
    let heights = totals.heights
    for (let item of demand.keys()) {
        for (let recipe of producers.get(item) || []) {
            heights.set(recipe, 0)
        }
    }
    // Bounded by the recipe count, in case the chosen recipes form a cycle.
    for (let pass = 0; pass < totals.rates.size; pass++) {
        let changed = false
        for (let [recipe, height] of heights) {
            if (ignore.has(recipe)) {
                continue
            }
            for (let ing of recipe.ingredients) {
                for (let producer of producers.get(ing.item) || []) {
                    if (!(heights.get(producer) > height)) {
                        heights.set(producer, height + 1)
                        changed = true
                    }
                }
            }
        }
        if (!changed) {
            break
        }
    }
    for (let recipe of totals.rates.keys()) {
        if (!heights.has(recipe)) {
            heights.set(recipe, 0)
        }
    }
    totals.topo = [...totals.rates.keys()].sort((a, b) => heights.get(a) - heights.get(b))
}

// demand: Map item to the rate it is wanted at.
export function solve(spec, demand, ignore) {
    let recipes = activeRecipes(spec, demand, ignore)
    let nets = recipes.map(recipe => netAmounts(recipe, ignore))
    let items = []
    for (let net of nets) {
        for (let item of net.keys()) {
            if (!items.includes(item)) {
                items.push(item)
            }
        }
    }
    let A = items.map(item => nets.map(net => net.get(item) || zero))
    let b = items.map(item => demand.get(item) || zero)
    let unit = i => items.map((item, j) => j === i ? one : zero)
    // The dual variables are y = y+ - y-, with y+, y- >= 0.
    let M = []
    recipes.forEach((recipe, r) => {
        let column = A.map(row => row[r])
        M.push(column.concat(column.map(v => zero.sub(v))))
    })
    items.forEach((item, i) => {
        M.push(unit(i).map(v => zero.sub(v)).concat(unit(i)))
    })
    let h = recipes.map(recipe => recipeCost(spec, recipe, ignore))
        .concat(items.map(() => SURPLUS_COST))
    let p = b.concat(b.map(v => zero.sub(v)))
    let solution
    try {
        solution = simplex(M, h, p)
    } catch (e) {
        if (e instanceof InfeasibleError) {
            throw new InfeasibleError(cyclicItems(spec, demand, ignore))
        }
        throw e
    }

    let totals = new Totals()
    recipes.forEach((recipe, r) => {
        if (!solution[r].isZero()) {
            totals.rates.set(recipe, solution[r])
        }
    })
    items.forEach((item, i) => {
        let extra = solution[recipes.length + i]
        if (!extra.isZero()) {
            totals.surplus.set(item, extra)
        }
    })
    computeHeights(totals, demand, ignore)
    return totals
}
