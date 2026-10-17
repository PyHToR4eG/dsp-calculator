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
import { makeDropdown, addInputs } from "./dropdown.js"
import { spec } from "./factory.js"
import { nameOf, t } from "./i18n.js"
import { Rational, zero, one } from "./rational.js"

const SELECTED_INPUT = "selected"

// events

function itemHandler(target) {
    return function(item) {
        target.itemKey = item.key
        target.item = item
        spec.updateSolution()
    }
}

function removeHandler(target) {
    return function() {
        spec.removeTarget(target)
        spec.updateSolution()
    }
}

function changeBuildingCountHandler(target) {
    return function() {
        target.buildingsChanged()
        spec.updateSolution()
    }
}

function changeRateHandler(target) {
    return function() {
        target.rateChanged()
        spec.updateSolution()
    }
}

// The game's replicator pages, by the first number of an item's grid cell.
const PICKER_PAGES = [[1, "Components"], [2, "Buildings"]]

function normalize(text) {
    return text.toLowerCase().replace(/ё/g, "е")
}

// The item picker mirrors the game's replicator: a Components and a Buildings
// page with each item in its in-game cell, plus a search box that matches
// names in either language. Returns the labels, as addInputs does.
function renderItemPicker(dropdown, name, items, selected, handler) {
    let header = dropdown.append("div")
        .classed("picker-header", true)
        // Clicks here shouldn't close the dropdown.
        .on("click", () => d3.event.stopPropagation())
    let tabs = header.selectAll("button")
        .data(PICKER_PAGES)
        .join("button")
            .classed("picker-tab", true)
            .text(([page, label]) => t(label))
    let search = header.append("input")
        .classed("picker-search", true)
        .attr("type", "search")
        .attr("placeholder", t("Search"))
        .attr("data-focus-on-open", "")
    let pages = dropdown.selectAll("div.picker-page")
        .data(PICKER_PAGES)
        .join("div")
            .classed("picker-page", true)
    let itemSpan = pages.selectAll("span")
        .data(([page]) => items.filter(item => item.grid[0] === page))
        .join("span")
            .style("grid-row", item => item.grid[1] + 1)
            .style("grid-column", item => item.grid[2] + 1)

    let currentPage = selected.grid[0]
    let showPage = page => {
        currentPage = page
        tabs.classed("active", ([p]) => p === page)
        pages.classed("hidden", ([p]) => p !== page)
    }
    let filter = text => {
        let query = normalize(text.trim())
        dropdown.classed("searching", query !== "")
        itemSpan.classed("hidden", item => query !== ""
            && !normalize(nameOf(item)).includes(query) && !normalize(item.name).includes(query))
        if (query === "") {
            showPage(currentPage)
        } else {
            tabs.classed("active", false)
            pages.classed("hidden", false)
        }
    }
    showPage(currentPage)
    tabs.on("click", ([page]) => {
        search.property("value", "")
        filter("")
        showPage(page)
    })
    search
        .on("input", function() {
            filter(this.value)
        })
        // Enter picks the first match.
        .on("keydown", function() {
            if (d3.event.key === "Enter") {
                let match = itemSpan.filter(function() {
                    return !this.classList.contains("hidden")
                }).node()
                if (match !== null) {
                    match.querySelector("label").click()
                }
            }
        })
    return addInputs(itemSpan, name, d => d === selected, handler)
}

let targetCount = 0

export class BuildTarget {
    constructor(index, itemKey, item, items) {
        this.index = index
        this.itemKey = itemKey
        this.item = item
        this.changedBuilding = true
        this.buildings = one
        this.rate = zero

        let element = d3.create("li")
            .classed("target", true)
        element.append("button")
            .classed("targetButton ui", true)
            .text("x")
            .attr("title", t("Remove this item."))
            .on("click", removeHandler(this))
        this.element = element.node()

        let itemLabel = renderItemPicker(makeDropdown(element), `target-${targetCount}`,
            items, item, itemHandler(this))

        itemLabel.append("img")
            .classed("icon", true)
            .attr("src", d => d.iconPath())
            //.attr("width", 32)
            //.attr("height", 32)
            .attr("title", d => nameOf(d))

        targetCount++

        this.buildingLabel = element.append("label")
            .classed(SELECTED_INPUT, true)
            .text(" " + t("Buildings:") + " ")
            .node()

        this.buildingInput = element.append("input")
            .on("change", changeBuildingCountHandler(this))
            .attr("type", "text")
            .attr("value", 1)
            .attr("size", 3)
            .attr("title", t("Enter a value to specify the number of buildings. The rate will be determined based on the number of items a single building can make."))
            .node()

        this.rateLabel = element.append("label")
            .node()
        this.setRateLabel()

        this.rateInput = element.append("input")
            .on("change", changeRateHandler(this))
            .attr("type", "text")
            .attr("value", "")
            .attr("size", 5)
            .attr("title", t("Enter a value to specify the rate. The number of buildings will be determined based on the rate."))
            .node()
    }
    setRateLabel() {
        this.rateLabel.textContent = " " + t("Items/" + spec.format.longRate + ":") + " "
    }
    getRate() {
        this.setRateLabel()
        let rate = zero
        let recipe = spec.getRecipe(this.item)
        if (recipe.category === null && this.changedBuilding) {
            this.rateChanged()
        }
        let baseRate = spec.getRecipeRate(recipe)
        if (baseRate !== null) {
            baseRate = baseRate.mul(recipe.gives(this.item))
        }
        if (this.changedBuilding) {
            rate = baseRate.mul(this.buildings)
            this.rateInput.value = spec.format.rate(rate)
        } else {
            rate = this.rate
            if (baseRate !== null) {
                let count = rate.div(baseRate)
                this.buildingInput.value = spec.format.count(count)
            } else {
                this.buildingInput.value = "N/A"
            }
            this.rateInput.value = spec.format.rate(rate)
        }
        return rate
    }
    buildingsChanged() {
        this.changedBuilding = true
        this.buildingLabel.classList.add(SELECTED_INPUT)
        this.rateLabel.classList.remove(SELECTED_INPUT)
        this.buildings = Rational.from_string(this.buildingInput.value)
        this.rate = zero
        this.rateInput.value = ""
    }
    setBuildings(count) {
        this.buildingInput.value = count
        this.buildingsChanged()
    }
    rateChanged() {
        this.changedBuilding = false
        this.buildingLabel.classList.remove(SELECTED_INPUT)
        this.rateLabel.classList.add(SELECTED_INPUT)
        this.buildings = zero
        this.rate = Rational.from_string(this.rateInput.value).div(spec.format.rateFactor)
        this.buildingInput.value = ""
    }
    setRate(rate) {
        this.rateInput.value = rate
        this.rateChanged()
    }
}
