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
import {Rational} from "./rational.js"

export class Item {
    constructor(key, name, grid, fuelValue) {
        this.key = key
        this.name = name
        // Cell in the game's replicator: [page, row, column]; page 1 is
        // Components, 2 is Buildings.
        this.grid = grid
        // Energy in MJ when burned as fuel, or null.
        this.fuelValue = fuelValue
        this.recipes = []
        this.uses = []
    }

    addRecipe(recipe) {
        this.recipes.push(recipe)
    }

    addUse(recipe) {
        this.uses.push(recipe)
    }

    iconPath() {
        return "images/" + this.name + ".png"
    }
}

export function getItems(data) {
    let items = new Map()
    for (let d of data.items) {
        let fuelValue = d.fuel_value === undefined ? null : Rational.from_string(String(d.fuel_value))
        items.set(d.key_name, new Item(d.key_name, d.name, d.grid, fuelValue))
    }
    return items
}
