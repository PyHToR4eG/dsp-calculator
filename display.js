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
import { toggleIgnoreHandler } from "./events.js"
import { spec } from "./factory.js"
import { nameOf, rateUnit, t } from "./i18n.js"
import { Rational, zero } from "./rational.js"

class Header {
    constructor(text, colspan) {
        this.text = text
        this.colspan = colspan
    }
}

// Building power in data.json is in kW.
let thousand = Rational.from_float(1000)

function formatPower(kw) {
    if (kw.less(thousand)) {
        return spec.format.alignCount(kw) + " " + t("kW")
    }
    return spec.format.alignCount(kw.div(thousand)) + " " + t("MW")
}

// Remember these values from update to update, to make it simpler to reuse
// elements.
let displayedItems = []

export function displayItems(spec, totals, ignore) {
    displayedItems = displayedItems.slice(0, totals.topo.length)
    while (displayedItems.length < totals.topo.length) {
        displayedItems.push({})
    }
    let totalAveragePower = zero
    let totalPeakPower = zero
    for (let i = 0; i < totals.topo.length; i++) {
        let recipe = totals.topo[i]
        let display = displayedItems[i]
        let rate = totals.rates.get(recipe)
        let item = recipe.product.item
        let itemRate = rate.mul(recipe.gives(item))
        let {average, peak} = spec.getPowerUsage(recipe, rate, totals.topo.length)
        totalAveragePower = totalAveragePower.add(average)
        totalPeakPower = totalPeakPower.add(peak)
        display.item = item
        display.itemRate = itemRate
        display.recipe = recipe
        display.ignore = ignore.has(recipe)
        display.rate = rate
        display.building = spec.getBuilding(recipe)
        display.count = spec.getCount(recipe, rate)

        display.average = average
        display.peak = peak
    }

    let headers = [
        new Header(t("items/" + spec.format.longRate), 2),
        new Header(t("belts"), 2),
        new Header(t("buildings"), 2),
        new Header(t("power"), 1),
    ]
    let totalCols = 0
    for (let header of headers) {
        totalCols += header.colspan
    }

    let table = d3.select("table#totals")

    let headerRow = table.selectAll("thead tr").selectAll("th")
        .data(headers)
    headerRow.exit().remove()
    headerRow.join("th")
        .text(d => d.text)
        .attr("colspan", d => d.colspan)

    // create missing rows
    let rows = table.selectAll("tbody").selectAll("tr")
        .data(displayedItems)
    rows.exit().remove()
    let row = rows.enter()
        .append("tr")
            .classed("display-row", true)
    // items/m
    row.append("td")
        .append("img")
            .classed("icon item-icon", true)
            .attr("width", 32)
            .attr("height", 32)
            .on("click", toggleIgnoreHandler)
    row.append("td")
        .classed("right-align", true)
        .append("tt")
            .classed("item-rate", true)
    // belts
    let beltCell = row.append("td")
        .classed("pad", true)
    beltCell.append("img")
        .classed("icon belt-icon", true)
        .attr("width", 32)
        .attr("height", 32)
    beltCell.append(d => new Text(" \u00d7"))
    row.append("td")
        .classed("right-align", true)
        .append("tt")
            .classed("belt-count", true)
    // buildings
    let buildingCell = row.append("td")
        .classed("pad building", true)
    buildingCell.append("img")
        .classed("icon building-icon", true)
        .attr("width", 32)
        .attr("height", 32)
    buildingCell.append(d => new Text(" \u00d7"))
    row.append("td")
        .classed("right-align building", true)
        .append("tt")
            .classed("building-count", true)
    /*
    row.filter(d => d.building === null)
        .append("td")
            .attr("colspan", 4)
    */
    // power
    row.append("td")
        .classed("right-align pad building", true)
        .append("tt")
            .classed("power", true)

    // update rows
    row = table.select("tbody").selectAll("tr")
        .classed("nobuilding", d => d.building === null)
    row.selectAll("img.item-icon")
        .classed("ignore", d => d.ignore)
        .attr("src", d => d.item.iconPath())
        .attr("title", d => nameOf(d.item))
    row.selectAll("tt.item-rate")
        .text(d => spec.format.alignRate(d.itemRate))
    row.selectAll("img.belt-icon")
        .attr("src", spec.belt.iconPath())
        .attr("title", nameOf(spec.belt))
    row.selectAll("tt.belt-count")
        .text(d => spec.format.alignCount(spec.getBeltCount(d.itemRate)))
    let buildingRow = row.filter(d => d.building !== null)
    buildingRow.selectAll("img.building-icon")
        .attr("src", d => d.building.iconPath())
        .attr("title", d => nameOf(d.building))
    buildingRow.selectAll("tt.building-count")
        .text(d => spec.format.alignCount(d.count) + d.building.getCountSuffix())

    buildingRow.selectAll("tt.power")
        .text(d => formatPower(d.average))
    buildingRow.selectAll(".building")
        .classed("hide-building", d => d.ignore)

    let totalPower = [totalAveragePower, totalPeakPower]
    let footerPowerRow = table.selectAll("tfoot tr.power")
    footerPowerRow.select("td.label")
        .attr("colspan", totalCols - 1)
    footerPowerRow.select("tt")
        .data(totalPower)
        .text(d => formatPower(d))

    // Byproducts made beyond what the factory uses.
    let surplus = d3.select("#surplus")
    surplus.selectAll("*").remove()
    if (totals.surplus.size > 0) {
        surplus.append("b").text(t("surplus:") + " ")
        let entry = surplus.selectAll("span")
            .data([...totals.surplus])
            .join("span")
                .classed("pad", true)
                .attr("title", ([item]) => nameOf(item))
        entry.append("img")
            .classed("icon", true)
            .attr("src", ([item]) => item.iconPath())
            .attr("width", 32)
            .attr("height", 32)
        entry.append("tt")
            .text(([item, rate]) => ` ${spec.format.rate(rate)}/${rateUnit(spec.format.rateName)} `)
    }
}

// Explains why there is no solution, or hides the message when items is null.
export function renderError(items) {
    let box = d3.select("#error")
    if (items === null) {
        box.style("display", "none").text("")
        return
    }
    let text = t("These targets can't be made with the chosen recipes.")
    if (items.length > 0) {
        text += " " + t("These items are only made from each other:") + " "
            + items.map(item => nameOf(item)).join(", ") + ". "
            + t("Choose another recipe for one of them in Settings, Recipes.")
    }
    box.style("display", null).text(text)
}
