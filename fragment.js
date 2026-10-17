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
import {DEFAULT_RATE, DEFAULT_RATE_PRECISION, DEFAULT_COUNT_PRECISION} from "./align.js"
import {DEFAULT_TAB, currentTab} from "./events.js"
import {spec, buildingSettingName, DEFAULT_GRAPH_SCALE, DEFAULT_BELT, DEFAULT_BELT_STACK, DEFAULT_MINER, DEFAULT_MINING_SPEED, DEFAULT_VEINS_PER_MINER, DEFAULT_VEINS_UTILIZATION} from "./factory.js"
import {Rational} from "./rational.js"

export function formatSettings() {
    let settings = ""
    if (currentTab !== DEFAULT_TAB) {
        settings += "tab=" + currentTab + "&"
    }
    if (spec.format.rateName !== DEFAULT_RATE) {
        settings += "rate=" + spec.format.rateName + "&"
    }
    if (spec.format.ratePrecision !== DEFAULT_RATE_PRECISION) {
        settings += "rp=" + spec.format.ratePrecision + "&"
    }
    if (spec.format.countPrecision !== DEFAULT_COUNT_PRECISION) {
        settings += "cp=" + spec.format.countPrecision + "&"
    }
    if (spec.graphScale !== DEFAULT_GRAPH_SCALE) {
        settings += "gh=" + spec.graphScale + "&"
    }
    if (spec.belt.key !== DEFAULT_BELT) {
        settings += "belt=" + spec.belt.key + "&"
    }
    if (spec.beltStack !== DEFAULT_BELT_STACK) {
        settings += "stack=" + spec.beltStack + "&"
    }
    for (let [category, buildings] of spec.getChoosableCategories()) {
        let building = spec.getCategoryBuilding(category)
        if (building !== buildings[0]) {
            settings += buildingSettingName(category) + "=" + building.key + "&"
        }
    }

    settings += "items="
    let targetStrings = []
    for (let target of spec.buildTargets) {
        let targetString = ""
        if (target.changedBuilding) {
            targetString = `${target.itemKey}:f:${target.buildingInput.value}`
        } else {
            targetString = `${target.itemKey}:r:${target.rate.mul(spec.format.rateFactor).toString()}`
        }
        targetStrings.push(targetString)
    }
    settings += targetStrings.join(",")

    let ignore = []
    for (let recipe of spec.ignore) {
        ignore.push(recipe.key)
    }
    if (ignore.length > 0) {
        settings += "&ignore=" + ignore.join(",")
    }

    let alt = []
    for (let [item, recipe] of spec.altRecipes) {
        alt.push(`${item.key}:${recipe.key}`)
    }
    if (alt.length > 0) {
        settings += "&alt=" + alt.join(",")
    }

    let mining = spec.mining
    if (mining.miner.key !== DEFAULT_MINER) {
        settings += "&miner=" + mining.miner.key
    }
    if (!mining.speed.equal(DEFAULT_MINING_SPEED)) {
        settings += "&mspeed=" + mining.speed.mul(Rational.from_float(100)).toDecimal(6)
    }
    if (!mining.veinsPerMiner.equal(DEFAULT_VEINS_PER_MINER)) {
        settings += "&vpm=" + mining.veinsPerMiner.toDecimal(6)
    }
    if (mining.utilization !== DEFAULT_VEINS_UTILIZATION) {
        settings += "&vu=" + mining.utilization
    }
    if (!mining.oilSeep.equal(spec.getDefaultOilSeep())) {
        settings += "&seep=" + mining.oilSeep.toDecimal(6)
    }
    for (let [giant, yields] of mining.giantYields) {
        if ([...yields].some(([item, value]) => !value.equal(giant.defaultYields.get(item)))) {
            settings += `&${giant.key}=` + [...yields.values()].map(value => value.toDecimal(6)).join(",")
        }
    }

    return settings
}

export function loadSettings(fragment) {
    let settings = new Map()
    fragment = fragment.substr(1)
    let pairs = fragment.split("&")
    for (let pair of pairs) {
        let i = pair.indexOf("=")
        if (i === -1) {
            continue
        }
        let name = pair.substr(0, i)
        let value = pair.substr(i + 1)
        settings.set(name, value)
    }
    return settings
}
