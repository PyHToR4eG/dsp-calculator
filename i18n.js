// Interface translations. English text stays in the code and the data and
// doubles as the lookup key; other languages map it to a translation. Item,
// recipe and building names come from data/<lang>.json, keyed by data key.

export const LANGUAGES = new Map([
    ["en", "English"],
    ["ru", "Русский"],
])

const STORAGE_KEY = "language"

const UI = {
    ru: {
        "Dyson Sphere Program Calculator": "Калькулятор Dyson Sphere Program",
        "Dyson Sphere Calculator": "Калькулятор Dyson Sphere Program",
        "Add new item.": "Добавить предмет.",
        "Remove this item.": "Убрать предмет.",
        "Visualize": "Граф",
        "Components": "Компоненты",
        "Buildings": "Здания",
        "Search": "Поиск",
        "Items": "Предметы",
        "Settings": "Настройки",
        "About": "О программе",
        "Buildings:": "Зданий:",
        "Items/second:": "Шт/сек:",
        "Items/minute:": "Шт/мин:",
        "Items/hour:": "Шт/час:",
        "Enter a value to specify the number of buildings. The rate will be determined based on the number of items a single building can make.":
            "Укажите число зданий, и скорость посчитается по выработке одного здания.",
        "Enter a value to specify the rate. The number of buildings will be determined based on the rate.":
            "Укажите скорость, и число зданий посчитается по ней.",
        "total average power:": "средняя мощность:",
        "total peak power:": "пиковая мощность:",
        "surplus:": "излишки:",
        "(surplus)": "(излишек)",
        "belts": "ленты",
        "buildings": "здания",
        "power": "мощность",
        "items/second": "шт/сек",
        "items/minute": "шт/мин",
        "items/hour": "шт/час",
        "veins": "жил",
        "These targets can't be made with the chosen recipes.":
            "С выбранными рецептами эти цели не получить.",
        "These items are only made from each other:": "Эти предметы производятся только друг из друга:",
        "Choose another recipe for one of them in Settings, Recipes.":
            "Выберите для одного из них другой рецепт в разделе «Настройки», «Рецепты».",
        "kW": "кВт",
        "MW": "МВт",
        "Display": "Отображение",
        "Display rates as:": "Скорость в:",
        "Rate precision:": "Точность скорости:",
        "Count precision:": "Точность количества:",
        "Language:": "Язык:",
        "Graph height:": "Высота графа:",
        "Makes the graph taller, for big factories.": "Делает граф выше — для больших производств.",
        "Factory": "Производство",
        "Belt:": "Конвейер:",
        "Belt stack:": "Стопка на ленте:",
        "Items stacked on the belt by pilers or logistics stations.":
            "Сколько предметов укладывается в стопку на ленте (автоукладчик, логистические станции).",
        "Assembling machine:": "Сборщик:",
        "Smelting:": "Плавильня:",
        "Chemical plant:": "Химический завод:",
        "Research:": "Лаборатория:",
        "Mining": "Добыча",
        "Mining machine:": "Буровая установка:",
        "Advanced miner speed:": "Скорость продвинутой буровой:",
        "Veins per miner:": "Жил на установку:",
        "Only used to estimate how many mining machines draw power.":
            "Нужно только для оценки мощности: сколько буровых установок потребляют энергию.",
        "Veins Utilization level:": "Уровень «Оптимизации добычи жил»:",
        "Each level adds 10% speed to mining machines, water pumps and oil extractors.":
            "Каждый уровень даёт +10% скорости буровым установкам, водяным насосам и нефтяным платформам.",
        "Oil seep yield:": "Дебит нефтяного источника:",
        "Crude oil per second shown on the seep, before research.":
            "Нефть в секунду, как показано на источнике, без учёта исследований.",
        "Base yield shown on the planet. Each orbital collector gathers 8 times that, plus research, and burns part of it as fuel.":
            "Базовый выход, как показано на планете. Каждый орбитальный сборщик собирает в 8 раз больше (плюс исследования) и сжигает часть собранного как топливо.",
        "Recipes": "Рецепты",
        "This calculator is based on": "Калькулятор основан на",
        "by Kirk McDonald and its Dyson Sphere Program forks.":
            "Кирка Макдональда и его форках для Dyson Sphere Program.",
        "Source code:": "Исходный код:",
    },
}

// Short rate units shown after numbers, e.g. "60/m".
const RATE_UNITS = {
    en: {s: "s", m: "m", h: "h"},
    ru: {s: "с", m: "мин", h: "ч"},
}

let language = "en"
let names = new Map()

function readStoredLanguage() {
    try {
        return localStorage.getItem(STORAGE_KEY)
    } catch (e) {
        return null
    }
}

// The viewer's saved choice, else their browser's language.
export function preferredLanguage() {
    let stored = readStoredLanguage()
    if (LANGUAGES.has(stored)) {
        return stored
    }
    let browser = (navigator.language || "en").slice(0, 2)
    return LANGUAGES.has(browser) ? browser : "en"
}

export function saveLanguage(lang) {
    try {
        localStorage.setItem(STORAGE_KEY, lang)
    } catch (e) {
        // Without storage the choice just doesn't outlive the page.
    }
}

export function getLanguage() {
    return language
}

// translatedNames: object mapping data keys to names, or null for English.
export function setLanguage(lang, translatedNames) {
    language = lang
    names = new Map(Object.entries(translatedNames || {}))
}

export function t(text) {
    let table = UI[language]
    return (table && table[text]) || text
}

// Display name of an item, recipe, building or belt.
export function nameOf(thing) {
    return names.get(thing.key) || thing.name
}

export function rateUnit(rateName) {
    return (RATE_UNITS[language] || RATE_UNITS.en)[rateName]
}

// Translates the page's static text: elements marked data-i18n have their
// text translated, and data-i18n-title their title.
export function translatePage() {
    document.title = t(document.title)
    for (let element of document.querySelectorAll("[data-i18n]")) {
        element.textContent = t(element.textContent.trim())
    }
    for (let element of document.querySelectorAll("[data-i18n-title]")) {
        element.title = t(element.title)
    }
}
