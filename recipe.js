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
import { Rational, zero, one } from "./rational.js"
import {spec} from "./factory.js"

export class Ingredient {
    constructor(item, amount) {
        this.item = item
        this.amount = amount
    }
}

// Items that a recipe both consumes and produces (hydrogen in X-ray cracking,
// refined oil in reforming refine) only circulate inside the building, so
// keep just the net amount on whichever side it lands. This way a recipe never
// consumes its own product.
function cancelCatalysts(ingredients, products) {
    let net = (list, other) => {
        let result = []
        for (let x of list) {
            let y = other.find(y => y.item === x.item)
            if (y === undefined) {
                result.push(x)
            } else if (y.amount.less(x.amount)) {
                result.push(new Ingredient(x.item, x.amount.sub(y.amount)))
            }
        }
        return result
    }
    return [net(ingredients, products), net(products, ingredients)]
}

class Recipe {
    constructor(key, name, category, time, ingredients, products) {
        this.key = key
        this.name = name
        this.category = category
        this.time = time
        ;[ingredients, products] = cancelCatalysts(ingredients, products)
        this.ingredients = ingredients
        for (let ing of ingredients) {
            ing.item.addUse(this)
        }
        this.products = products
        for (let product of products) {
            product.item.addRecipe(this)
        }
    }
    // The main product, used for the recipe's icon and table row.
    get product() {
        return this.products[0]
    }
    gives(item) {
        for (let product of this.products) {
            if (product.item === item) {
                return product.amount
            }
        }
        return null
    }
    iconPath() {
        return this.product.item.iconPath()
    }
}

function makeIngredients(items, list) {
    // Read decimals like 0.9 exactly, not as the nearest binary fraction.
    return list.map(([item_key, amount]) => new Ingredient(items.get(item_key), Rational.from_string(String(amount))))
}

function makeRecipe(data, items, d) {
    let time = Rational.from_float(d.time)
    let ingredients = makeIngredients(items, d.ingredients)
    let products = makeIngredients(items, d.products || [d.product])
    return new Recipe(d.key_name, d.name, d.category, time, ingredients, products)
}

class ResourceRecipe extends Recipe {
    constructor(item, category) {
        super(item.key, item.name, category, zero, [], [new Ingredient(item, one)])
    }
}

// Raw materials from outside a planet's mines: a sulfuric acid ocean pumped
// like water, or a gas giant's orbital collectors. They are alternatives, so
// they come after the regular recipes.
class SourceRecipe extends Recipe {
    constructor(key, name, category, products) {
        super(key, name, category, one, [], products)
        // For gas giants: Map item to the planet's base yield per second.
        this.defaultYields = new Map(products.map(product => [product.item, product.amount]))
    }
}

export function getRecipes(data, items) {
    let recipes = new Map()
    for (let d of data.resources) {
        let item = items.get(d.key_name)
        recipes.set(d.key_name, new ResourceRecipe(item, d.category))
    }
    for (let d of data.recipes) {
        recipes.set(d.key_name, makeRecipe(data, items, d))
    }
    for (let d of data.sources || []) {
        let products = makeIngredients(items, d.products)
        recipes.set(d.key_name, new SourceRecipe(d.key_name, d.name, d.category, products))
    }
    for (let [itemKey, item] of items) {
        if (item.recipes.length === 0) {
            recipes.set(itemKey, new ResourceRecipe(item, null))
        }
    }
    return recipes
}
