// Background presets for the Studio canvas
// Updated with realistic metallic-framed chalkboard images

import { ImageSourcePropType } from 'react-native';

export interface BackgroundOption {
    id: string;
    name: string;
    type: 'color' | 'image';
    color: string; // Primary color for preview thumbnail
    imageSource?: ImageSourcePropType; // For image-based backgrounds
}

// Image assets for metallic frame backgrounds
const BOARD_BLACK = require('@/assets/backgrounds/board_black.jpg');
const BOARD_BLUE = require('@/assets/backgrounds/board_blue.jpg');
const BOARD_RED = require('@/assets/backgrounds/board_red.jpg');
const BOARD_GREEN = require('@/assets/backgrounds/board_green.jpg');

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
    // Solid colors (simple backgrounds)
    { id: 'white', name: 'White', type: 'color', color: '#ffffff' },
    { id: 'black', name: 'Black', type: 'color', color: '#000000' },
    { id: 'gray', name: 'Gray', type: 'color', color: '#1a1a1a' },
    { id: 'cream', name: 'Cream', type: 'color', color: '#f5f5dc' },
    { id: 'navy', name: 'Navy', type: 'color', color: '#0a1628' },
    { id: 'burgundy', name: 'Burgundy', type: 'color', color: '#4a0e0e' },
    { id: 'forest', name: 'Forest', type: 'color', color: '#0d2818' },
    { id: 'slate', name: 'Slate', type: 'color', color: '#3d4f5f' },
    { id: 'rose', name: 'Rose', type: 'color', color: '#f8e8e8' },
    { id: 'mint', name: 'Mint', type: 'color', color: '#e8f5e9' },

    // Metallic framed boards (image-based) - NEW
    { id: 'board_black', name: 'Black Board', type: 'image', color: '#1a1a1a', imageSource: BOARD_BLACK },
    { id: 'board_blue', name: 'Blue Board', type: 'image', color: '#1e3a5f', imageSource: BOARD_BLUE },
    { id: 'board_red', name: 'Red Board', type: 'image', color: '#5a1a1a', imageSource: BOARD_RED },
    { id: 'board_green', name: 'Green Board', type: 'image', color: '#2a4a2a', imageSource: BOARD_GREEN },
];

export const DEFAULT_BACKGROUND = BACKGROUND_OPTIONS[0]; // White

// Polaroid frame asset
export const POLAROID_FRAME = require('@/assets/frames/polaroid.png');

// The transparent opening in polaroid.png, as fractions of the (square) frame.
// Measured off the asset's alpha channel: a 700x624 window at (161, 167) inside
// 1024x1024. It is wider than it is tall and it sits high, because the fat border
// on a polaroid is the bottom one.
//
// Both the canvas and the preview used to hardcode a centred 130x130 square at
// inset 25, which is neither the right shape nor the right place -- it hung 16px
// below the opening, so the bottom of every photo was lost behind the border. Keep
// this as the single source of truth so the two never drift apart again.
export const POLAROID_WINDOW = {
    left: 161 / 1024,
    top: 167 / 1024,
    width: 700 / 1024,
    height: 624 / 1024,
} as const;

/** Absolute window rect for a polaroid frame rendered at `size` x `size`. */
export function polaroidWindowRect(size: number) {
    return {
        left: POLAROID_WINDOW.left * size,
        top: POLAROID_WINDOW.top * size,
        width: POLAROID_WINDOW.width * size,
        height: POLAROID_WINDOW.height * size,
    };
}
