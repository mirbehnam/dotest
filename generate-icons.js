const fs = require('fs');
const { createCanvas } = require('canvas');

function createIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');

    // Draw circle background
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw play icon
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = size * 0.015;

    const centerX = size / 2;
    const centerY = size / 2;
    const playSize = size * 0.3;

    ctx.beginPath();
    ctx.moveTo(centerX - playSize/2, centerY - playSize);
    ctx.lineTo(centerX - playSize/2, centerY + playSize);
    ctx.lineTo(centerX + playSize, centerY);
    ctx.closePath();
    ctx.fill();

    // Draw download arrow
    const arrowY = size * 0.75;
    const arrowSize = size * 0.15;

    ctx.lineWidth = size * 0.04;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Arrow line
    ctx.beginPath();
    ctx.moveTo(centerX, arrowY - arrowSize);
    ctx.lineTo(centerX, arrowY + arrowSize/2);
    ctx.stroke();

    // Arrow head
    ctx.beginPath();
    ctx.moveTo(centerX - arrowSize/2, arrowY);
    ctx.lineTo(centerX, arrowY + arrowSize/2);
    ctx.lineTo(centerX + arrowSize/2, arrowY);
    ctx.stroke();

    return canvas;
}

// Create directory if it doesn't exist
if (!fs.existsSync('./icons')) {
    fs.mkdirSync('./icons');
}

// Generate icons
const sizes = [16, 48, 128];

sizes.forEach(size => {
    const canvas = createIcon(size);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(`./icons/icon${size}.png`, buffer);
    console.log(`✓ Created icon${size}.png`);
});

console.log('\n✅ All icons generated successfully!');
