import {
    getRequestHeaders,
    processDroppedFiles,
    callPopup
} from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";
import { debounce } from "../../../utils.js";

const extensionName = "ST-Chub-Finder";
// CORS Proxy to bypass browser restrictions
const CORS_PROXY = "https://corsproxy.io/?";
const API_SEARCH = "https://api.chub.ai/api/characters/search";
const API_DOWNLOAD = "https://api.chub.ai/api/characters/download";

let resultsContainer = null;
let currentResults = [];

async function searchChub(query, nsfw = false, page = 1) {
    const params = new URLSearchParams({
        search: query,
        first: 20,
        page: page,
        sort: "download_count",
        asc: "false",
        venus: "true",
        include_forks: "true",
        nsfw: nsfw,
        require_images: "false",
        require_custom_prompt: "false"
    });

    const fullUrl = `${API_SEARCH}?${params.toString()}`;
    const proxyUrl = CORS_PROXY + encodeURIComponent(fullUrl);

    console.log(`Searching Chub: ${fullUrl}`);
    
    try {
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        // Debugging: check what we actually got
        console.log("Chub Search Results:", data);
        
        return data.nodes || [];
    } catch (e) {
        console.error("Chub search failed", e);
        // Show error in UI
        if (resultsContainer) {
            resultsContainer.innerHTML = `<div style="color:red; padding:10px;">Error: ${e.message}<br>Check console (F12)</div>`;
        }
        toastr.error("Search failed: " + e.message);
        return [];
    }
}

async function downloadChubChar(fullPath) {
    console.log(`Downloading ${fullPath}...`);
    toastr.info(`Downloading ${fullPath}...`);
    
    // First try: ST's internal import (if supported via URL)
    // Actually, ST's /api/content/importUUID often works best if we can just pass the URL, 
    // but the reference extension manually fetches the blob. Let's do that for robustness.

    try {
        // Fetch blob from Chub
        let res = await fetch(API_DOWNLOAD, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullPath, format: "tavern", version: "main" })
        });

        if (!res.ok) {
            // Backup: avatar endpoint
            res = await fetch(`https://avatars.charhub.io/avatars/${fullPath}/avatar.webp`);
        }

        if (!res.ok) throw new Error("Download failed");

        const blob = await res.blob();
        const file = new File([blob], fullPath.split('/').pop() + ".png", { type: blob.type });

        // Use ST's processor
        await processDroppedFiles([file]);
        toastr.success("Character imported!");
    } catch (e) {
        console.error(e);
        toastr.error("Import failed: " + e.message);
    }
}

function renderResults() {
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = currentResults.map(node => `
        <div class="chub-item">
            <img src="https://avatars.charhub.io/avatars/${node.fullPath}/avatar.webp" loading="lazy" 
                 onclick="window.open('https://chub.ai/characters/${node.fullPath}', '_blank')">
            <div class="info">
                <div class="name">${node.name}</div>
                <div class="author">by ${node.fullPath.split('/')[0]}</div>
                <div class="desc">${node.tagline || node.description || ""}</div>
                <div class="tags">${(node.topics || []).slice(0, 5).join(", ")}</div>
            </div>
            <div class="download-btn fa-solid fa-cloud-arrow-down" 
                 title="Import" onclick="window.downloadChubChar('${node.fullPath}')"></div>
        </div>
    `).join("");
}

// Global for onclick access
window.downloadChubChar = downloadChubChar;

async function openChubFinder() {
    const html = `
        <div class="chub-finder-wrapper">
            <div class="chub-results" id="chub-results-list"></div>
            <div class="chub-controls">
                <input type="text" id="chub-search-input" class="text_pole" placeholder="Search (e.g. 'Miku')">
                <label><input type="checkbox" id="chub-nsfw-check"> NSFW</label>
                <div class="menu_button" id="chub-search-btn">Search</div>
            </div>
        </div>
    `;

    await callPopup(html, "text", "", { wide: true, large: true, okButton: "Close" });
    
    resultsContainer = document.getElementById("chub-results-list");
    
    const doSearch = async () => {
        const query = document.getElementById("chub-search-input").value;
        const nsfw = document.getElementById("chub-nsfw-check").checked;
        resultsContainer.innerHTML = '<div style="text-align:center; padding:20px;">Searching...</div>';
        currentResults = await searchChub(query, nsfw);
        renderResults();
    };

    document.getElementById("chub-search-btn").addEventListener("click", doSearch);
    document.getElementById("chub-search-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") doSearch();
    });
}

jQuery(async () => {
    // Inject button near the existing import button
    $("#external_import_button").after(`
        <div id="chub-finder-btn" class="menu_button fa-solid fa-search" 
             title="Find on Chub" style="order: 100;"></div>
    `);
    
    $("#chub-finder-btn").on("click", openChubFinder);
    
    console.log("ST-Chub-Finder loaded");
});
