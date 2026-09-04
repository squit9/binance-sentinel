        const axios = require("axios");
const https = require("https");

// ==========================================
// BINANCE SENTINEL V5
// MARKET SCANNER + ANALYST + RISK + DECISION
// ==========================================

const BASE_URL = "https://18.64.21.130";

const agent = new https.Agent({
    servername: "api.binance.com"
});

const SYMBOLS = [
    "BTCUSDT",
    "ETHUSDT",
    "BNBUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "DOGEUSDT"
];


// ==========================================
// BINANCE API
// ==========================================

async function binanceGet(path, params = {}) {

    try {

        const response = await axios.get(
            `${BASE_URL}${path}`,
            {
                params,
                headers: {
                    Host: "api.binance.com"
                },
                httpsAgent: agent,
                timeout: 10000
            }
        );

        return response.data;

    } catch (error) {

        console.error(
            `API ERROR ${path}:`,
            error.message
        );

        return null;
    }
}


// ==========================================
// MARKET DATA
// ==========================================

async function get24h(symbol) {

    return await binanceGet(
        "/api/v3/ticker/24hr",
        { symbol }
    );
}


async function getKlines(symbol) {

    return await binanceGet(
        "/api/v3/klines",
        {
            symbol,
            interval: "15m",
            limit: 100
        }
    );
}


// ==========================================
// EMA
// ==========================================

function calculateEMA(values, period) {

    if (values.length < period) {
        return null;
    }

    const multiplier =
        2 / (period + 1);

    let ema =
        values
            .slice(0, period)
            .reduce((a, b) => a + b, 0)
            / period;

    for (
        let i = period;
        i < values.length;
        i++
    ) {

        ema =
            ((values[i] - ema) * multiplier) + ema;
    }

    return ema;
}


// ==========================================
// RSI
// ==========================================

function calculateRSI(values, period = 14) {

    if (values.length <= period) {
        return null;
    }

    let gains = 0;
    let losses = 0;

    for (
        let i = 1;
        i <= period;
        i++
    ) {

        const change =
            values[i] - values[i - 1];

        if (change > 0) {
            gains += change;
        } else {
            losses += Math.abs(change);
        }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (
        let i = period + 1;
        i < values.length;
        i++
    ) {

        const change =
            values[i] - values[i - 1];

        const gain =
            change > 0 ? change : 0;

        const loss =
            change < 0 ? Math.abs(change) : 0;

        avgGain =
            ((avgGain * (period - 1)) + gain)
            / period;

        avgLoss =
            ((avgLoss * (period - 1)) + loss)
            / period;
    }

    if (avgLoss === 0) {
        return 100;
    }

    const rs = avgGain / avgLoss;

    return 100 - (100 / (1 + rs));
}


// ==========================================
// VOLUME RATIO
// ==========================================

function calculateVolumeRatio(klines) {

    if (klines.length < 22) {
        return null;
    }

    const closed =
        klines.slice(0, -1);

    const volumes =
        closed.map(
            candle => Number(candle[5])
        );

    const current =
        volumes[volumes.length - 1];

    const previous =
        volumes.slice(-21, -1);

    const average =
        previous.reduce(
            (a, b) => a + b,
            0
        ) / previous.length;

    if (average === 0) {
        return null;
    }

    return current / average;
}


// ==========================================
// 75 MIN MOMENTUM
// ==========================================

function calculateMomentum(closes) {

    if (closes.length < 6) {
        return null;
    }

    const current =
        closes[closes.length - 1];

    const previous =
        closes[closes.length - 6];

    if (previous === 0) {
        return null;
    }

    return (
        (current - previous) /
        previous
    ) * 100;
}


// ==========================================
// MARKET ANALYSIS
// ==========================================

async function analyzeSymbol(symbol) {

    const [
        marketData,
        klines
    ] = await Promise.all([
        get24h(symbol),
        getKlines(symbol)
    ]);

    if (!marketData || !klines) {
        return null;
    }

    if (klines.length < 30) {
        return null;
    }

    // Ignore currently forming candle
    const closed =
        klines.slice(0, -1);

    const closes =
        closed.map(
            candle => Number(candle[4])
        );

    const price =
        Number(marketData.lastPrice);

    const change24h =
        Number(
            marketData.priceChangePercent
        );

    const ema20 =
        calculateEMA(
            closes,
            20
        );

    const rsi =
        calculateRSI(
            closes,
            14
        );

    const volumeRatio =
        calculateVolumeRatio(
            klines
        );

    const momentum =
        calculateMomentum(
            closes
        );


    // ======================================
    // SCORE
    // ======================================

    let score = 50;

    const bullish = [];
    const risks = [];


    // EMA
    if (
        ema20 !== null &&
        price > ema20
    ) {

        score += 15;

        bullish.push(
            "Price is above EMA20"
        );

    } else {

        score -= 15;

        risks.push(
            "Price is below EMA20"
        );
    }


    // RSI
    if (
        rsi !== null &&
        rsi >= 55 &&
        rsi <= 70
    ) {

        score += 15;

        bullish.push(
            `RSI is bullish at ${rsi.toFixed(2)}`
        );

    } else if (
        rsi !== null &&
        rsi > 70
    ) {

        score -= 5;

        risks.push(
            `RSI is overheated at ${rsi.toFixed(2)}`
        );

    } else if (
        rsi !== null &&
        rsi < 40
    ) {

        score -= 10;

        risks.push(
            `RSI is weak at ${rsi.toFixed(2)}`
        );
    }


    // VOLUME
    if (volumeRatio !== null) {

        if (volumeRatio >= 2) {

            score += 20;

            bullish.push(
                `Major volume spike at ${volumeRatio.toFixed(2)}x`
            );

        } else if (
            volumeRatio >= 1.5
        ) {

            score += 15;

            bullish.push(
                `Strong volume at ${volumeRatio.toFixed(2)}x`
            );

        } else if (
            volumeRatio >= 1.2
        ) {

            score += 8;

            bullish.push(
                `Above-average volume at ${volumeRatio.toFixed(2)}x`
            );

        } else if (
            volumeRatio < 0.7
        ) {

            score -= 5;

            risks.push(
                `Low volume at ${volumeRatio.toFixed(2)}x`
            );
        }
    }


    // 24H MOMENTUM
    if (change24h >= 5) {

        score += 5;

        bullish.push(
            `Strong 24h momentum of ${change24h.toFixed(2)}%`
        );

    } else if (
        change24h >= 2
    ) {

        score += 3;

        bullish.push(
            `Positive 24h momentum of ${change24h.toFixed(2)}%`
        );

    } else if (
        change24h <= -5
    ) {

        score -= 5;

        risks.push(
            `Negative 24h momentum of ${change24h.toFixed(2)}%`
        );
    }


    // SHORT TERM MOMENTUM
    if (momentum !== null) {

        if (momentum >= 1) {

            score += 5;

            bullish.push(
                `Positive 75m momentum of ${momentum.toFixed(2)}%`
            );

        } else if (
            momentum <= -1
        ) {

            score -= 5;

            risks.push(
                `Negative 75m momentum of ${momentum.toFixed(2)}%`
            );
        }
    }


    score =
        Math.max(
            0,
            Math.min(100, score)
        );


    // ======================================
    // BIAS
    // ======================================

    let bias = "NEUTRAL";

    if (score >= 75) {

        bias = "BULLISH";

    } else if (score <= 35) {

        bias = "BEARISH";
    }


    return {
        symbol,
        price,
        change24h,
        ema20,
        rsi,
        volumeRatio,
        momentum,
        score,
        bias,
        bullish,
        risks
    };
}


// ==========================================
// DECISION ENGINE
// ==========================================

function decisionEngine(data) {

    const {
        price,
        ema20,
        rsi,
        volumeRatio,
        momentum,
        score,
        bias
    } = data;


    let thesisStatus =
        "UNCONFIRMED";

    let action =
        "WAIT";

    let confidence =
        score;

    const triggers = [];
    const invalidations = [];


    // ======================================
    // BEARISH
    // ======================================

    if (
        bias === "BEARISH"
    ) {

        thesisStatus =
            "BEARISH";

        action =
            "AVOID";

        confidence =
            Math.max(score, 60);

        if (ema20 !== null) {

            invalidations.push(
                "Price reclaims EMA20"
            );
        }

        triggers.push(
            "Wait for market structure to improve"
        );

        return {
            thesisStatus,
            action,
            confidence,
            triggers,
            invalidations
        };
    }


    // ======================================
    // NEUTRAL
    // ======================================

    if (
        bias === "NEUTRAL"
    ) {

        thesisStatus =
            "UNCERTAIN";

        action =
            "WAIT";

        confidence =
            score;

        triggers.push(
            "Wait for stronger directional structure"
        );

        if (ema20 !== null) {

            invalidations.push(
                "Current structure remains unclear"
            );
        }

        return {
            thesisStatus,
            action,
            confidence,
            triggers,
            invalidations
        };
    }


    // ======================================
    // BULLISH
    // ======================================

    const trendConfirmed =
        ema20 !== null &&
        price > ema20;

    const rsiConfirmed =
        rsi !== null &&
        rsi >= 55 &&
        rsi <= 70;

    const volumeConfirmed =
        volumeRatio !== null &&
        volumeRatio >= 1.0;

    const momentumConfirmed =
        momentum !== null &&
        momentum > 0;


    // ======================================
    // FULL CONFIRMATION
    // ======================================

    if (
        trendConfirmed &&
        rsiConfirmed &&
        volumeConfirmed &&
        momentumConfirmed &&
        score >= 75
    ) {

        thesisStatus =
            "FULLY CONFIRMED";

        action =
            "CONSIDER LONG";

        confidence =
            Math.min(
                95,
                score + 5
            );

        triggers.push(
            "Price above EMA20"
        );

        triggers.push(
            "RSI confirmed bullish"
        );

        triggers.push(
            "Volume above 1.0x"
        );

        triggers.push(
            "Positive short-term momentum"
        );

    }


    // ======================================
    // PARTIAL CONFIRMATION
    // ======================================

    else {

        thesisStatus =
            "PARTIALLY CONFIRMED";

        action =
            "WAIT FOR CONFIRMATION";

        confidence =
            score;

        if (!trendConfirmed) {

            triggers.push(
                "Price must remain above EMA20"
            );
        }

        if (!rsiConfirmed) {

            triggers.push(
                "RSI should remain between 55-70"
            );
        }

        if (!volumeConfirmed) {

            triggers.push(
                "Volume should recover above 1.0x"
            );
        }

        if (!momentumConfirmed) {

            triggers.push(
                "Short-term momentum should turn positive"
            );
        }
    }


    // ======================================
    // INVALIDATION
    // ======================================

    if (ema20 !== null) {

        invalidations.push(
            "Price closes below EMA20"
        );
    }

    if (
        rsi !== null &&
        rsi > 75
    ) {

        invalidations.push(
            "RSI becomes excessively overheated"
        );
    }


    return {
        thesisStatus,
        action,
        confidence,
        triggers,
        invalidations
    };
}


// ==========================================
// RISK ENGINE
// ==========================================

function calculateRisk(data) {

    const {
        price,
        ema20,
        bias
    } = data;

    let entryLow = null;
    let entryHigh = null;
    let stopLoss = null;
    let target1 = null;
    let target2 = null;
    let riskReward = null;
    let riskLevel = "MEDIUM";


    if (
        bias === "BULLISH" &&
        ema20 !== null
    ) {

        entryLow =
            price * 0.9965;

        entryHigh =
            price * 1.0035;

        stopLoss =
            ema20 * 0.994;

        const entry =
            (entryLow + entryHigh) / 2;

        const risk =
            entry - stopLoss;

        target1 =
            entry + (risk * 1.5);

        target2 =
            entry + (risk * 2.5);

        riskReward =
            "1:2.5";


        if (
            price - stopLoss
            > price * 0.03
        ) {

            riskLevel =
                "HIGH";

        } else {

            riskLevel =
                "MEDIUM";
        }
    }


    return {
        entryLow,
        entryHigh,
        stopLoss,
        target1,
        target2,
        riskReward,
        riskLevel
    };
}


// ==========================================
// FORMAT PRICE
// ==========================================

function formatPrice(price) {

    if (
        price === null ||
        price === undefined ||
        Number.isNaN(price)
    ) {
        return "N/A";
    }

    if (price >= 1000) {
        return price.toFixed(2);
    }

    if (price >= 1) {
        return price.toFixed(4);
    }

    return price.toFixed(6);
}


// ==========================================
// MAIN
// ==========================================

async function main() {

    console.log("");

    console.log(
        "=========================================="
    );

    console.log(
        "        BINANCE SENTINEL V5"
    );

    console.log(
        "        DECISION INTELLIGENCE"
    );

    console.log(
        "=========================================="
    );

    console.log("");

    console.log(
        "Timeframe: 15m"
    );

    console.log(
        `Scanning ${SYMBOLS.length} markets...`
    );

    console.log("");


    const results = [];


    // ======================================
    // SCAN
    // ======================================

    for (
        const symbol of SYMBOLS
    ) {

        process.stdout.write(
            `Scanning ${symbol}... `
        );

        const result =
            await analyzeSymbol(symbol);

        if (result) {

            results.push(result);

            console.log("OK");

        } else {

            console.log("FAILED");
        }
    }


    // ======================================
    // RANK
    // ======================================

    results.sort(
        (a, b) =>
            b.score - a.score
    );


    console.log("");

    console.log(
        "=========================================="
    );

    console.log(
        "             MARKET RANKING"
    );

    console.log(
        "=========================================="
    );


    results.forEach(
        (r, index) => {

            console.log(
                `${index + 1}. `
                + `${r.symbol} | `
                + `Score ${r.score}/100 | `
                + `${r.bias}`
            );
        }
    );


    if (
        results.length === 0
    ) {

        console.log(
            "No market data available."
        );

        return;
    }


    // ======================================
    // TOP CANDIDATE
    // ======================================

    const top =
        results[0];


    const decision =
        decisionEngine(top);

    const risk =
        calculateRisk(top);


    // ======================================
    // AI ANALYST
    // ======================================

    console.log("");

    console.log(
        "=========================================="
    );

    console.log(
        "              AI ANALYST"
    );

    console.log(
        "=========================================="
    );

    console.log("");

    console.log(
        `TOP CANDIDATE: ${top.symbol}`
    );

    console.log(
        `PRICE: $${formatPrice(top.price)}`
    );

    console.log(
        `MARKET BIAS: ${top.bias}`
    );


    // ======================================
    // THESIS
    // ======================================

    console.log("");

    console.log(
        "THESIS"
    );

    console.log(
        "------------------------------------------"
    );

    if (
        top.bias === "BULLISH"
    ) {

        console.log(
            `${top.symbol} shows a bullish `
            + `short-term structure.`
        );

        console.log(
            `Price is trading above EMA20 `
            + `with a score of ${top.score}/100.`
        );

    } else if (
        top.bias === "BEARISH"
    ) {

        console.log(
            `${top.symbol} shows a weak `
            + `short-term structure.`
        );

        console.log(
            `Price is below EMA20 with a `
            + `score of ${top.score}/100.`
        );

    } else {

        console.log(
            `${top.symbol} does not have a `
            + `clear directional advantage.`
        );
    }


    // ======================================
    // BULLISH FACTORS
    // ======================================

    console.log("");

    console.log(
        "BULLISH FACTORS"
    );

    console.log(
        "------------------------------------------"
    );

    if (
        top.bullish.length === 0
    ) {

        console.log("None");

    } else {

        top.bullish.forEach(
            item =>
                console.log(`+ ${item}`)
        );
    }


    // ======================================
    // RISK FACTORS
    // ======================================

    console.log("");

    console.log(
        "RISK FACTORS"
    );

    console.log(
        "------------------------------------------"
    );

    if (
        top.risks.length === 0
    ) {

        console.log(
            "No major risk detected."
        );

    } else {

        top.risks.forEach(
            item =>
                console.log(`! ${item}`)
        );
    }


    // ======================================
    // THESIS CHALLENGER
    // ======================================

    console.log("");

    console.log(
        "THESIS CHALLENGER"
    );

    console.log(
        "------------------------------------------"
    );

    if (
        top.volumeRatio !== null &&
        top.volumeRatio < 1
    ) {

        console.log(
            "Bullish thesis lacks volume confirmation."
        );

        console.log(
            "Low participation increases breakout failure risk."
        );

    } else if (
        top.momentum !== null &&
        top.momentum < 0
    ) {

        console.log(
            "Short-term momentum contradicts the bullish thesis."
        );

    } else if (
        top.rsi !== null &&
        top.rsi > 70
    ) {

        console.log(
            "RSI is overheated."
        );

        console.log(
            "Pullback risk is elevated."
        );

    } else {

        console.log(
            "No major contradiction detected."
        );
    }


    // ======================================
    // RISK ENGINE
    // ======================================

    console.log("");

    console.log(
        "RISK ENGINE"
    );

    console.log(
        "------------------------------------------"
    );

    console.log(
        `Risk Level  : ${risk.riskLevel}`
    );


    if (
        risk.entryLow !== null
    ) {

        console.log(
            `Entry Zone  : $${formatPrice(risk.entryLow)}`
            + ` - $${formatPrice(risk.entryHigh)}`
        );

        console.log(
            `Stop Loss   : $${formatPrice(risk.stopLoss)}`
        );

        console.log(
            `Target 1    : $${formatPrice(risk.target1)}`
        );

        console.log(
            `Target 2    : $${formatPrice(risk.target2)}`
        );

        console.log(
            `Risk/Reward : ${risk.riskReward}`
        );

    } else {

        console.log(
            "No long risk setup generated."
        );
    }


    // ======================================
    // DECISION ENGINE
    // ======================================

    console.log("");

    console.log(
        "DECISION ENGINE"
    );

    console.log(
        "------------------------------------------"
    );

    console.log(
        `Thesis Status : ${decision.thesisStatus}`
    );

    console.log(
        `Action        : ${decision.action}`
    );

    console.log(
        `Confidence    : ${decision.confidence}/100`
    );


    // ======================================
    // TRIGGERS
    // ======================================

    console.log("");

    console.log(
        "TRIGGERS"
    );

    console.log(
        "------------------------------------------"
    );

    decision.triggers.forEach(
        item =>
            console.log(`+ ${item}`)
    );


    // ======================================
    // INVALIDATIONS
    // ======================================

    console.log("");

    console.log(
        "INVALIDATION"
    );

    console.log(
        "------------------------------------------"
    );

    decision.invalidations.forEach(
        item =>
            console.log(`! ${item}`)
    );


    // ======================================
    // FINAL DECISION
    // ======================================

    console.log("");

    console.log(
        "=========================================="
    );

    console.log(
        "             FINAL DECISION"
    );

    console.log(
        "=========================================="
    );

    console.log("");

    console.log(
        `MARKET : ${top.symbol}`
    );

    console.log(
        `BIAS   : ${top.bias}`
    );

    console.log(
        `ACTION : ${decision.action}`
    );

    console.log(
        `SCORE  : ${top.score}/100`
    );

    console.log(
        `CONFIDENCE : ${decision.confidence}/100`
    );

    console.log("");

    console.log(
        "=========================================="
    );

    console.log(
        "           SENTINEL COMPLETE"
    );

    console.log(
        "=========================================="
    );

    console.log("");
}


// ==========================================
// START
// ==========================================

main();