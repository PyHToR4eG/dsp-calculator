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
import {t} from "./i18n.js"
import {Rational, zero} from "./rational.js"

class Building {
    constructor(key, name, category, power, max, rate) {
        this.key = key
        this.name = name
        this.category = category
        this.power = power
        this.max = max
        this.rate = Rational.from_float(rate)
        // What building counts are in, if not buildings, e.g. "veins".
        this.countUnit = ""
    }

    // Suffix for building counts, e.g. " veins" in "× 12 veins".
    getCountSuffix() {
        return this.countUnit === "" ? "" : " " + t(this.countUnit)
    }

    getCount(spec, recipe, rate) {
        return rate.div(this.getRecipeRate(spec, recipe))
    }

    getRecipeRate(spec, recipe) {
        return recipe.time.reciprocate().mul(this.rate)
    }

    // The number of buildings placed, given the count from getCount.
    getMachineCount(spec, count) {
        return count
    }

    getPower(spec) {
        return this.power
    }

    iconPath() {
        return "images/" + this.name + ".png"
    }
}

// A fractionator turns a fixed share of the hydrogen passing by on the belt
// into deuterium, so its speed depends on the belt, not on a recipe time. The
// rest of the hydrogen goes on along the belt, so only what gets converted is
// consumed.
class Fractionator extends Building {
    constructor(key, name, category, power, max, rate, conversion) {
        super(key, name, category, power, max, rate)
        this.conversion = Rational.from_float(conversion)
    }

    getRecipeRate(spec, recipe) {
        return spec.getBeltRate().mul(this.conversion)
    }
}

// Orbital collectors gather a gas giant's gases at a multiple of the planet's
// base yield, but burn part of what they gather to power themselves. One
// recipe run is one collector working for a second, so the recipe's product
// amounts are the net yield of one collector, set by updateYields.
class OrbitalCollector extends Building {
    constructor(key, name, category, power, max, rate, gatheringSpeed, fuelPower) {
        super(key, name, category, power, max, rate)
        this.gatheringSpeed = Rational.from_float(gatheringSpeed)
        // Megawatts burned from the gathered gases.
        this.fuelPower = Rational.from_float(fuelPower)
    }

    getRecipeRate(spec, recipe) {
        return this.rate
    }

    updateYields(spec, recipe) {
        let yields = spec.mining.giantYields.get(recipe) || recipe.defaultYields
        let speed = this.gatheringSpeed.mul(spec.mining.getUtilizationFactor())
        // The fuel is taken from each gas in proportion to the energy gathered.
        let energy = zero
        for (let product of recipe.products) {
            energy = energy.add(yields.get(product.item).mul(product.item.fuelValue))
        }
        for (let product of recipe.products) {
            let base = yields.get(product.item)
            let burned = energy.isZero() ? zero : this.fuelPower.mul(base).div(energy)
            let net = base.mul(speed).sub(burned)
            product.amount = zero.less(net) ? net : zero
        }
    }
}

// Mining machines collect from each vein they cover, so they are counted in
// veins; pumps and oil extractors are counted as buildings. Veins Utilization
// research speeds all of them up.
class Miner extends Building {
    constructor(key, name, category, power, baseRate, adjustableSpeed) {
        super(key, name, category, power, null)
        this.baseRate = baseRate
        // The Advanced mining machine has a 100-300% speed slider.
        this.adjustableSpeed = adjustableSpeed
        this.countUnit = category === "mineral" ? "veins" : ""
    }

    getRecipeRate(spec, recipe) {
        let mining = spec.mining
        // An oil extractor yields whatever its seep does.
        let rate = this.category === "oil" ? mining.oilSeep : this.baseRate
        rate = rate.mul(mining.getUtilizationFactor())
        if (this.adjustableSpeed) {
            rate = rate.mul(mining.speed)
        }
        return rate
    }

    getMachineCount(spec, count) {
        if (this.category === "mineral") {
            return count.div(spec.mining.veinsPerMiner)
        }
        return count
    }

    // The speed slider raises power by the square of the speed.
    getPower(spec) {
        if (this.adjustableSpeed) {
            return this.power.mul(spec.mining.speed).mul(spec.mining.speed)
        }
        return this.power
    }
}

export function getBuildings(data) {
    let buildings = []
    for (let d of data.buildings) {
        let args = [d.key_name, d.name, d.category, Rational.from_float(d.power), d.max, d.rate]
        if (d.conversion !== undefined) {
            buildings.push(new Fractionator(...args, d.conversion))
        } else if (d.gathering_speed !== undefined) {
            buildings.push(new OrbitalCollector(...args, d.gathering_speed, d.fuel_power))
        } else {
            buildings.push(new Building(...args))
        }
    }
    for (let d of data.miners) {
        buildings.push(new Miner(
            d.key_name,
            d.name,
            d.category,
            Rational.from_float(d.power),
            Rational.from_float(d.base_rate).div(Rational.from_float(60)),
            d.adjustable_speed === true,
        ))
    }
    return buildings
}
