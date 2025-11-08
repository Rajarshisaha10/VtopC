/*
 * This is the CLIENT-SIDE (browser) CAPTCHA solver.
 * It is imported by static/script.js
 */

// This file MUST be created by you, containing the weights and biases.
// It is imported relative to this file.
import { bitmaps } from "./bitmaps.js";

/* --- Type Definitions (for JSDoc) ---
 * @typedef {number[]} Vector
 * @typedef {number[][]} Matrix
 */

/**
 * Slices the CAPTCHA image into 6 individual character blocks.
 * @param {Uint8ClampedArray} pixelData - Raw pixel data from canvas
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Matrix[]} An array of 6 character image matrices
 */
function getImageBlocks(pixelData, width, height) {
    // 1. Calculate saturation for each pixel
    /** @type {Vector} */
    const saturate = new Array(pixelData.length / 4);
    for (let i = 0; i < pixelData.length; i += 4) {
        const r = pixelData[i], g = pixelData[i + 1], b = pixelData[i + 2];
        const min = Math.min(r, g, b);
        const max = Math.max(r, g, b);
        saturate[i / 4] = max === 0 ? 0 : Math.round(((max - min) * 255) / max);
    }

    // 2. Reconstruct the image as a 2D matrix
    /** @type {Matrix} */
    const img = [];
    for (let i = 0; i < 40; i++) {
        img[i] = [];
        for (let j = 0; j < 200; j++) {
            img[i][j] = saturate[i * 200 + j];
        }
    }

    // 3. Slice the image into 6 character blocks based on known coordinates
    /** @type {Matrix[]} */
    const blocks = new Array(6);
    for (let i = 0; i < 6; i++) {
        const x1 = (i + 1) * 25 + 2;
        const y1 = 7 + 5 * (i % 2) + 1;
        const x2 = (i + 2) * 25 + 1;
        const y2 = 35 - 5 * ((i + 1) % 2);
        blocks[i] = img.slice(y1, y2).map(row => row.slice(x1, x2));
    }
    return blocks;
}

/**
 * Binarizes a single character image matrix based on its average pixel value.
 * @param {Matrix} charImg - A 2D matrix of a single character.
 * @returns {Matrix} A 2D matrix of 0s and 1s.
 */
function binarizeImage(charImg) {
    let avg = 0;
    charImg.forEach(row => row.forEach(pixel => (avg += pixel)));
    avg /= charImg.length * charImg[0].length;

    /** @type {Matrix} */
    const bits = new Array(charImg.length);
    for (let i = 0; i < charImg.length; i++) {
        bits[i] = new Array(charImg[0].length);
        for (let j = 0; j < charImg[0].length; j++) {
            bits[i][j] = charImg[i][j] > avg ? 1 : 0;
        }
    }
    return bits;
}

/**
 * Flattens a 2D matrix into a 1D vector.
 * @param {Matrix} matrix - The 2D matrix.
 * @returns {Vector} The flattened 1D vector.
 */
function flatten(matrix) {
    return matrix.flat();
}

/**
 * Performs matrix multiplication (a * b).
 * @param {Matrix} a - The first matrix.
 * @param {Matrix} b - The second matrix.
 * @returns {Matrix} The resulting product matrix.
 */
function matMul(a, b) {
    const x = a.length, z = a[0].length, y = b[0].length;
    const product = Array(x).fill(0).map(() => Array(y).fill(0));
    for (let i = 0; i < x; i++) {
        for (let j = 0; j < y; j++) {
            for (let k = 0; k < z; k++) {
                product[i][j] += a[i][k] * b[k][j];
            }
        }
    }
    return product;
}

/**
 * Performs vector addition (a + b).
 * @param {Vector} a - The first vector.
 * @param {Vector} b - The second vector.
 * @returns {Vector} The resulting sum vector.
 */
function matAdd(a, b) {
    return a.map((val, i) => val + b[i]);
}

/**
 * Applies the softmax function to a vector.
 * @param {Vector} vec - The input vector (logits).
 * @returns {Vector} A vector of probabilities.
 */
function softmax(vec) {
    const exps = vec.map(x => Math.exp(x));
    const sumExps = exps.reduce((a, b) => a + b);
    return exps.map(e => e / sumExps);
}

/**
 * Solves the VTOP CAPTCHA from a base64 string.
 * This is the main exported function.
 * @param {string} base64 - The base64-encoded CAPTCHA image string.
 * @returns {Promise<string>} The 6-character solved CAPTCHA text.
 */
export async function solveCaptchaClient(base64) {
    if (!bitmaps.weights || !bitmaps.biases || bitmaps.weights.length === 0 || bitmaps.biases.length === 0) {
        throw new Error("Captcha model data (weights/biases) not found or is empty in bitmaps.js.");
    }
    
    const LABEL_TEXT = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const img = new Image();
    img.src = base64;
    await new Promise((res) => (img.onload = res));

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Could not create 2D canvas context.");
    }
    ctx.drawImage(img, 0, 0);

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const charBlocks = getImageBlocks(data, canvas.width, canvas.height);

    let result = "";
    for (const block of charBlocks) {
        // Binarize and flatten the character block
        /** @type {Matrix} */
        let inputVector = binarizeImage(block);
        inputVector = [flatten(inputVector)]; // Wrap in [] to make it a 1xN matrix

        // Run the neural net (MatMul + Add)
        /** @type {Matrix} */
        let output = matMul(inputVector, bitmaps.weights);
        /** @type {Vector} */
        const logits = matAdd(output[0], bitmaps.biases);

        // Get the probabilities and find the best match
        const probabilities = softmax(logits);
        const maxProbIndex = probabilities.indexOf(Math.max(...probabilities));
        result += LABEL_TEXT[maxProbIndex];
    }

    return result;
}