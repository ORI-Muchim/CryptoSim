const Decimal = require('decimal.js');

// Configure Decimal.js for financial precision
Decimal.config({ precision: 28, rounding: 4 });

/**
 * Financial precision utilities using Decimal.js
 */
class FinancialMath {
    /**
     * Add two numbers with precision
     * @param {number|string} a 
     * @param {number|string} b 
     * @returns {string}
     */
    static add(a, b) {
        return new Decimal(a).add(new Decimal(b)).toString();
    }

    /**
     * Subtract two numbers with precision
     * @param {number|string} a 
     * @param {number|string} b 
     * @returns {string}
     */
    static subtract(a, b) {
        return new Decimal(a).sub(new Decimal(b)).toString();
    }

    /**
     * Multiply two numbers with precision
     * @param {number|string} a 
     * @param {number|string} b 
     * @returns {string}
     */
    static multiply(a, b) {
        return new Decimal(a).mul(new Decimal(b)).toString();
    }

    /**
     * Divide two numbers with precision
     * @param {number|string} a 
     * @param {number|string} b 
     * @returns {string}
     */
    static divide(a, b) {
        return new Decimal(a).div(new Decimal(b)).toString();
    }

    /**
     * Compare two numbers
     * @param {number|string} a 
     * @param {number|string} b 
     * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
     */
    static compare(a, b) {
        return new Decimal(a).cmp(new Decimal(b));
    }

    /**
     * Check if a number is greater than another
     * @param {number|string} a 
     * @param {number|string} b 
     * @returns {boolean}
     */
    static isGreaterThan(a, b) {
        return new Decimal(a).gt(new Decimal(b));
    }

    /**
     * Check if a number is less than another
     * @param {number|string} a 
     * @param {number|string} b 
     * @returns {boolean}
     */
    static isLessThan(a, b) {
        return new Decimal(a).lt(new Decimal(b));
    }

    /**
     * Check if a number equals another
     * @param {number|string} a 
     * @param {number|string} b 
     * @returns {boolean}
     */
    static isEqual(a, b) {
        return new Decimal(a).eq(new Decimal(b));
    }

    /**
     * Round to specified decimal places
     * @param {number|string} value 
     * @param {number} decimals 
     * @returns {string}
     */
    static round(value, decimals = 8) {
        return new Decimal(value).toDecimalPlaces(decimals).toString();
    }

    /**
     * Calculate percentage
     * @param {number|string} part 
     * @param {number|string} whole 
     * @returns {string}
     */
    static percentage(part, whole) {
        return new Decimal(part).div(new Decimal(whole)).mul(100).toString();
    }

    /**
     * Calculate profit/loss percentage
     * @param {number|string} currentPrice 
     * @param {number|string} buyPrice 
     * @returns {string}
     */
    static profitLossPercent(currentPrice, buyPrice) {
        return new Decimal(currentPrice)
            .sub(new Decimal(buyPrice))
            .div(new Decimal(buyPrice))
            .mul(100)
            .toString();
    }

    /**
     * Convert to number (use carefully and only for display)
     * @param {number|string} value 
     * @returns {number}
     */
    static toNumber(value) {
        return new Decimal(value).toNumber();
    }

    /**
     * Validate if value is a valid number
     * @param {any} value 
     * @returns {boolean}
     */
    static isValid(value) {
        try {
            new Decimal(value);
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = { FinancialMath, Decimal };