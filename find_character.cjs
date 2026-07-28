const fs = require('fs');
const path = 'data/characters.ts';
const content = fs.readFileSync(path, 'utf8');

const lines = content.split(/\r?\n/);

let currentCharacter = null;
let characterText = "";
const characters = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimLine = line.trim();
    const indent = line.length - line.trimStart().length;
    
    if (trimLine.startsWith('name:') && indent === 4) {
        if (currentCharacter) {
            characters.push({ name: currentCharacter, text: characterText });
        }
        currentCharacter = trimLine.match(/^name:\s*["']([^"']+)["'],?$/)[1];
        characterText = "";
    }
    
    characterText += line + "\n";
}
if (currentCharacter) {
    characters.push({ name: currentCharacter, text: characterText });
}

const targets = ["Nagare Uzumaki", "Hayato Hanzo (H)"];
for (const char of characters) {
    if (targets.includes(char.name)) {
        console.log(`=== CHARACTER: ${char.name} ===`);
        console.log(char.text);
    }
}
