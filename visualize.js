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
import { Rational, zero, one } from "./rational.js"
import { Ingredient } from "./recipe.js"

const iconSize = 48
const buildingIconSize = 36

const nodePadding = 20

const columnWidth = 150
// Height of the tallest box, times the "Graph height" setting.
const maxNodeHeight = 350

function makeLink(source, target, item, rate) {
    let link = {
        "source": source,
        "target": target,
        "item": item,
        "value": rate.toFloat(),
        "rate": rate,
    }
    let belts = []
    let beltCountExact = spec.getBeltCount(rate)
    let beltCount = beltCountExact.toFloat()
    for (let j = one; j.less(beltCountExact); j = j.add(one)) {
        let i = j.toFloat()
        belts.push({link, i, beltCount})
    }
    link.belts = belts
    return link
}

function makeGraph(totals, targets, ignore) {
    let rates = new Map()
    for (let target of targets) {
        let rate = rates.get(target.item)
        if (rate === undefined) {
            rate = zero
        }
        rate = rate.add(target.getRate())
        rates.set(target.item, rate)
    }
    // One output node per target item, plus one per byproduct nobody needs.
    let nodes = []
    let addOutput = (item, rate, surplus) => nodes.push({
        "name": surplus ? `${nameOf(item)} ${t("(surplus)")}` : nameOf(item),
        "item": item,
        "surplus": surplus,
        "ingredients": [new Ingredient(item, rate)],
        "building": null,
        "count": zero,
        "rate": rate,
        "ignore": false,
    })
    for (let [item, rate] of rates) {
        addOutput(item, rate, false)
    }
    for (let [item, rate] of totals.surplus) {
        addOutput(item, rate, true)
    }
    let nodeMap = new Map()
    // Map item to the recipes making it and how much each makes.
    let producers = new Map()

    for (let [recipe, rate] of totals.rates) {
        let building = spec.getBuilding(recipe)
        let count = spec.getCount(recipe, rate)
        let node = {
            "name": nameOf(recipe),
            "ingredients": recipe.ingredients,
            "recipe": recipe,
            "building": building,
            "count": count,
            "rate": rate,
            "ignore": ignore.has(recipe),
        }
        nodes.push(node)
        nodeMap.set(recipe, node)
        for (let product of recipe.products) {
            if (!producers.has(product.item)) {
                producers.set(product.item, [])
            }
            producers.get(product.item).push({recipe, made: rate.mul(product.amount)})
        }
    }

    let links = []
    for (let node of nodes) {
        if (node.ignore) {
            continue
        }
        for (let ing of node.ingredients) {
            let rate
            if (node.recipe === undefined) {
                rate = ing.amount
            } else {
                rate = totals.rates.get(node.recipe).mul(ing.amount)
            }
            // When several recipes make the item, each supplies its share.
            let sources = producers.get(ing.item) || []
            let totalMade = sources.reduce((sum, s) => sum.add(s.made), zero)
            for (let {recipe, made} of sources) {
                links.push(makeLink(nodeMap.get(recipe), node, ing.item, rate.mul(made).div(totalMade)))
            }
        }
    }
    return {"nodes": nodes, "links": links}
}

function recipeValue(recipe, rate, ignore) {
    let inputValue = zero
    if (!ignore.has(recipe)) {
        for (let ing of recipe.ingredients) {
            inputValue = inputValue.add(rate.mul(ing.amount))
        }
    }
    let outputValue = zero
    for (let product of recipe.products) {
        outputValue = outputValue.add(rate.mul(product.amount))
    }
    if (inputValue.less(outputValue)) {
        return outputValue
    } else {
        return inputValue
    }
}

function rankHeightEstimate(rank, valueFactor) {
    let total = nodePadding * (rank.length - 1)
    for (let value of rank) {
        total += value.mul(valueFactor).toFloat()
    }
    return total
}

function getRateString(d) {
    return d.rate === null ? "" : `\u00d7 ${spec.format.rate(d.rate)}/${rateUnit(spec.format.rateName)}`
}

function getMachineCountString(d) {
    console.assert(!d.count.isZero(), "Items that aren't produced through machines can't have a machine count!")
    return `\u00d7 ${spec.format.count(d.count)}${d.building.getCountSuffix()}`
}

// This is basically an educated guess, but seems to match whatever Chrome and
// Firefox do pretty well.
function beltPath(d) {
    let x0 = d.link.source.x1
    let y0 = d.link.y0
    let y0top = y0 - d.link.width / 2
    let x1 = d.link.target.x0
    let y1 = d.link.y1
    let y1top = y1 - d.link.width / 2
    let mid = (x1 - x0) / 2
    let slope = (y1 - y0) / (x1 - x0)

    let dy = d.link.width / d.beltCount
    let y_offset = d.i*dy
    let y0belt = y0top + y_offset
    let y1belt = y1top + y_offset

    let midAdjust = (d.link.width/2 - y_offset) * slope
    let x_control = x0 + mid + midAdjust
    return `M ${x0},${y0belt} C ${x_control},${y0belt},${x_control},${y1belt},${x1},${y1belt}`
}

let color = d3.scaleOrdinal(d3.schemeCategory10)

export function renderTotals(totals, targets, ignore) {
    let data = makeGraph(totals, targets, ignore)

    let maxRank = 0
    let ranks = new Map()
    let largestValue = zero
    for (let [recipe, rank] of totals.heights) {
        let rankList = ranks.get(rank)
        if (rankList === undefined) {
            rankList = []
            ranks.set(rank, rankList)
        }
        if (rank > maxRank) {
            maxRank = rank
        }
        let rate = totals.rates.get(recipe)
        let value = recipeValue(recipe, rate, ignore)
        if (largestValue.less(value)) {
            largestValue = value
        }
        rankList.push(value)
    }
    // The output nodes form a column of their own.
    let outputValues = data.nodes.filter(node => node.recipe === undefined).map(node => node.rate)
    ranks.set(-1, outputValues)
    for (let value of outputValues) {
        if (largestValue.less(value)) {
            largestValue = value
        }
    }
    // Nothing to draw: no targets, or no solution for them.
    if (largestValue.isZero() || totals.rates.size === 0) {
        d3.select("svg#graph").selectAll("g").remove()
        return
    }
    let tallest = maxNodeHeight * spec.graphScale
    let beltDensity = tallest / spec.getBeltCount(largestValue).toFloat()
    // The width of the display is the number of columns, times the width of
    // each. Heights start at 0, and the output nodes add one more column.
    let maxTextWidth = 0
    let testSVG = d3.select("body").append("svg")
    for (let node of data.nodes) {
        let text = testSVG.append("text")
        if (node.count.isZero()) {
            text = text.text(getRateString(node))
        } else {
            text.append("tspan").attr("x", 0).text(getMachineCountString(node))
        }
        let textWidth = text.node().getBBox().width
        if (!node.count.isZero()) {
            textWidth += buildingIconSize + 2
        }
        text.remove()
        if (textWidth > maxTextWidth) {
            maxTextWidth = textWidth
        }
    }
    testSVG.remove()
    let nodeWidth = iconSize + maxTextWidth + 4
    let width = (maxRank + 1) * (nodeWidth + columnWidth) + nodeWidth
    // The height of the display is normalized by the height of the tallest box
    // in the graph. We define it to be (approximately) `tallest` pixels high.
    let valueFactor = Rational.from_float(tallest).div(largestValue)
    let largestEstimate = 0
    for (let [rank, rankList] of ranks) {
        let estimate = rankHeightEstimate(rankList, valueFactor)
        if (estimate > largestEstimate) {
            largestEstimate = estimate
        }
    }
    let height = largestEstimate

    let svg = d3.select("svg#graph")
        .attr("viewBox", `0,0,${width+20},${height+20}`)
        .style("width", width+20)
        .style("height", height+20)

    svg.selectAll("g").remove()

    let sankey = d3.sankey()
        .nodeWidth(nodeWidth)
        .nodePadding(nodePadding)
        .nodeAlign(d3.sankeyRight)
        .extent([[10, 10], [width + 10, height + 10]])
    let {nodes, links} = sankey(data)

    // Node rects
    let rects = svg.append("g")
        .classed("nodes", true)
        .selectAll("rect")
        .data(nodes)
        .join("g")
            .classed("node", true)

    rects.append("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("height", d => d.y1 - d.y0)
        .attr("width", d => d.x1 - d.x0)
        .attr("fill", d => d.surplus ? "#555" : d3.color(color(d.name)).darker())
    rects.append("image")
            .classed("ignore", d => ignore.has(d.recipe))
            .attr("x", d => d.x0 + 2)
            .attr("y", d => d.y0 + (d.y1 - d.y0) / 2 - (iconSize / 2))
            .attr("height", iconSize)
            .attr("width", iconSize)
            .attr("xlink:href", d => d.recipe ? d.recipe.iconPath() : d.item.iconPath())

    // For nodes without an associated machine, display the rate on a single line:
    rects.filter(d => d.count.isZero())
        .append("text")
            .attr("x", d => d.x0 + iconSize + 2)
            .attr("y", d => (d.y0 + d.y1) / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", "start")
            .text(getRateString)

    // For nodes with an associated machine, display the machine's icon and
    // count:
    let machineNodes = rects.filter(d => !d.count.isZero())
    machineNodes.append("image")
        .attr("x", d => d.x0 + iconSize + 2)
        .attr("y", d => (d.y0 + d.y1) / 2 - buildingIconSize / 2)
        .attr("height", buildingIconSize)
        .attr("width", buildingIconSize)
        .attr("xlink:href", d => d.building.iconPath())
    machineNodes.append("text")
        .attr("x", d => d.x0 + iconSize + buildingIconSize + 4)
        .attr("y", d => (d.y0 + d.y1) / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "start")
        .text(getMachineCountString)

    // Link paths
    let link = svg.append("g")
        .classed("links", true)
        .selectAll("g")
        .data(links)
        .join("g")
            //.style("mix-blend-mode", "multiply")
    link.append("path")
        .attr("fill", "none")
        .attr("stroke-opacity", 0.3)
        .attr("d", d3.sankeyLinkHorizontal())
        .attr("stroke", d => color(d.source.name))
        .attr("stroke-width", d => Math.max(1, d.width))
    // Don't draw belts if we have less than three pixels per belt.
    if (beltDensity >= 3) {
        link.append("g")
            .selectAll("path")
            .data(d => d.belts)
            .join("path")
                .attr("fill", "none")
                .attr("stroke-opacity", 0.3)
                .attr("d", beltPath)
                .attr("stroke", d => color(d.link.source.name))
                .attr("stroke-width", 1)
    }
    link.append("title")
        .text(d => `${d.source.name} \u2192 ${d.target.name}\n${nameOf(d.item)}: ${spec.format.rate(d.rate)}/${rateUnit(spec.format.rateName)}`)
    // A recipe may send several items, so label each link with its item.
    const linkIconSize = 16
    link.append("image")
        .attr("x", d => d.source.x1 + 4)
        .attr("y", d => d.y0 - linkIconSize / 2)
        .attr("height", linkIconSize)
        .attr("width", linkIconSize)
        .attr("xlink:href", d => d.item.iconPath())
    link.append("text")
        .attr("x", d => d.source.x1 + 6 + linkIconSize)
        .attr("y", d => d.y0)
        .attr("dy", "0.35em")
        .attr("text-anchor", "start")
        .text(d => spec.format.rate(d.rate) + "/" + rateUnit(spec.format.rateName))

    // Overlay transparent rect on top of each node, for click events.
    let rectElements = svg.selectAll("g.node").nodes()
    let overlayData = []
    // Flash the graph tab to be visible, so that the graph is laid out and
    // the BBox is not empty.
    let graphTab = d3.select("#graph_tab")
    let origDisplay = d3.style(graphTab.node(), "display")
    graphTab.style("display", "block")
    for (let i = 0; i < nodes.length; i++) {
        let rect = rectElements[i].getBBox()
        let node = nodes[i]
        let recipe = node.recipe
        if (recipe !== undefined) {
            overlayData.push({rect, node, recipe})
        }
    }
    graphTab.style("display", origDisplay)
    svg.append("g")
        .classed("overlay", true)
        .selectAll("rect")
        .data(overlayData)
        .join("rect")
            .attr("stroke", "none")
            .attr("fill", "transparent")
            .attr("x", d => d.rect.x)
            .attr("y", d => d.rect.y)
            .attr("width", d => d.rect.width)
            .attr("height", d => d.rect.height)
            .on("click", toggleIgnoreHandler)
            .append("title")
                .text(d => d.node.name + (d.node.count.isZero() ? "" : `\n${nameOf(d.node.building)} ${getMachineCountString(d.node)}`))
}

