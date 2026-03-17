// UCL, Bartlett, RC5
import * as THREE from "three";
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";

import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

import { createControls } from "./controls.js";
import { createWarpClient } from "../warp/warpClient.js";

import { initParamsUi } from "../sender/paramsUi.js";
import { initChatUi } from "../sender/chatUi.js";

if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
}

// Viewport container — renderer fills this element (5/8 of screen)
const vpArea = document.getElementById("viewport-area");
function vpW() { return vpArea ? vpArea.clientWidth : window.innerWidth; }
function vpH() { return vpArea ? vpArea.clientHeight : window.innerHeight; }

// Scene
const scene = new THREE.Scene();
window.__scene = scene;
scene.background = new THREE.Color(0xf0f0f0);

// Camera
const camera = new THREE.PerspectiveCamera(60, vpW() / vpH(), 0.1, 1000);
camera.position.set(0, 2.92, 8.05);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(5, 15, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.bias = -0.0001;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 100;
dirLight.shadow.camera.left = -20;
dirLight.shadow.camera.right = 20;
dirLight.shadow.camera.top = 20;
dirLight.shadow.camera.bottom = -20;
scene.add(dirLight);

// Ground receiving shadows (nice grounding)
const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

// Grid
const grid = new THREE.GridHelper(50, 50, 0x888888, 0xdddddd);
grid.position.y = -0.01;
scene.add(grid);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(vpW(), vpH());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const vpEl = document.getElementById("viewport");
(vpEl || document.body).appendChild(renderer.domElement);


// Postprocessing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));



// Outline
const outlinePass = new OutlinePass(
    new THREE.Vector2(vpW(), vpH()),
    scene,
    camera
);
outlinePass.edgeStrength = 4;
outlinePass.edgeThickness = 3;
outlinePass.edgeGlow = 0;
outlinePass.pulsePeriod = 0;
outlinePass.visibleEdgeColor.set(0x00aaff);
outlinePass.hiddenEdgeColor.set(0x00aaff);
composer.addPass(outlinePass);
const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.material.uniforms["resolution"].value.set(
    1 / (vpW() * (renderer.getPixelRatio ? renderer.getPixelRatio() : 1)),
    1 / (vpH() * (renderer.getPixelRatio ? renderer.getPixelRatio() : 1))
);
composer.addPass(fxaaPass);


// Better shadow
const gtaoPass = new GTAOPass(scene, camera, vpW(), vpH());
gtaoPass.enabled = true;

if (gtaoPass.params) {
    gtaoPass.params.intensity = 0.9;
    gtaoPass.params.radius = 0.35;
    gtaoPass.params.thickness = 1.0;
    gtaoPass.params.distanceFallOff = 1.0;
}
composer.addPass(gtaoPass);
composer.addPass(new OutputPass());



// Environment map
const loader = new HDRLoader();
const envMap = await loader.loadAsync('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/empty_warehouse_01_1k.hdr');
envMap.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = envMap;

//Controls
const controls = createControls({
    camera,
    renderer,
    scene,
    ui: {
        btnMove: document.getElementById("btnMove"),
        btnRotate: document.getElementById("btnRotate"),
        btnScale: document.getElementById("btnScale"),
        selectedName: document.getElementById("selectedName"),
    },
    onSelect: (obj) => {
        outlinePass.selectedObjects = obj ? [obj] : [];
    },
});


//UIs
const URL_MAIN = "wss://relay.curvf.com/ws";
const URL_BACKUP = "wss://warp-relay.qinzehaozln.workers.dev/ws";

const statusText = document.getElementById("statusText");
const connectionDot = document.getElementById("connectionDot");

const loadingSpinner = document.getElementById("loadingSpinner");

function setLoadingProgress(p) {
    if (!loadingSpinner) return;
    const pct = Math.round(Math.max(0, Math.min(1, Number(p) || 0)) * 100);
    loadingSpinner.style.setProperty("--p", String(pct));
    loadingSpinner.setAttribute("data-pct", String(pct));
}


function setLoadingVisible(v) {
    if (!loadingSpinner) return;
    loadingSpinner.style.opacity = v ? "1" : "0.45";
}



function setDotState(state) {
    if (!connectionDot) return;
    connectionDot.classList.remove("connected", "connecting");
    if (state === "connected") connectionDot.classList.add("connected");
    else if (state === "connecting") connectionDot.classList.add("connecting");
}

let warpGroup = new THREE.Group();
warpGroup.name = "Warp Group";
scene.add(warpGroup);

// Material
const sharedMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.5,
    envMapIntensity: 1.0,
    side: THREE.DoubleSide,
});

// Standing PNG display cards — placed in scene directly (survive warp reloads)
const sceneCards = [];
const _cardLoader = new THREE.TextureLoader();

function makeImageCard(name, url, realHeight, x, y, z) {
    _cardLoader.load(url, (texture) => {
        const img = texture.image;

        // Strip near-white background
        const canvas = document.createElement("canvas");
        canvas.width  = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) {
                d[i + 3] = 0;
            } else {
                // Reduce saturation 5%: blend each channel 5% toward luminance
                const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                d[i]     = d[i]     + (lum - d[i])     * 0.05;
                d[i + 1] = d[i + 1] + (lum - d[i + 1]) * 0.05;
                d[i + 2] = d[i + 2] + (lum - d[i + 2]) * 0.05;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        const cleanTex = new THREE.CanvasTexture(canvas);

        const h = realHeight;
        const w = h * (img.width / img.height);
        const geo = new THREE.PlaneGeometry(w, h);

        // Base layer — cutout mode: writes depth, no shadow artifacts
        const matBase = new THREE.MeshBasicMaterial({
            map: cleanTex,
            transparent: true,
            alphaTest: 0.5,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, matBase);
        mesh.name = name;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.position.set(x, y, z);
        scene.add(mesh);
        sceneCards.push(mesh);
        controls.addPickable?.(mesh);

        // Multiply overlay — child of base mesh, follows parent transforms
        const matMul = new THREE.MeshBasicMaterial({
            map: cleanTex,
            transparent: true,
            alphaTest: 0.5,
            blending: THREE.MultiplyBlending,
            premultipliedAlpha: true,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const meshMul = new THREE.Mesh(geo.clone(), matMul);
        meshMul.castShadow = false;
        meshMul.receiveShadow = false;
        meshMul.position.z = 0.001;
        mesh.add(meshMul);
    });
}

makeImageCard("Plant", "../assets/cards/plant.png", 2.70, -0.893, 4.631, 1.077);
makeImageCard("Books", "../assets/cards/books.png", 0.90,  0.210, 2.958, 1.108);
makeImageCard("Cat",   "../assets/cards/cat.png",   1.35,  2.423, 0.675, 1.097);

function clearWarpGeometries() {
    controls.detach?.();
    controls.clearPickables?.();

    for (let i = warpGroup.children.length - 1; i >= 0; i--) {
        const child = warpGroup.children[i];
        warpGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
    }
}


function setWarpGeometries(geometries) {
    clearWarpGeometries();

    for (let i = 0; i < geometries.length; i++) {
        const mesh = new THREE.Mesh(geometries[i], sharedMaterial);
        mesh.name = `Warp Mesh ${i}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        warpGroup.add(mesh);
        controls.addPickable?.(mesh);
    }

    // Re-register cards after clearPickables
    sceneCards.forEach(c => controls.addPickable?.(c));
}

//sending parameters
let warpClientInstance = null;
let paramsUiHandle = null;

const initialRoom =
    new URLSearchParams(window.location.search).get("room") || "warp_test_local_001";

let currentRoom = initialRoom;

// Set default orbit target to match the baked-in camera view
controls.orbit.target.set(0, 2.5, 0);
controls.orbit.update();

// ── Default camera state ─────────────────────────────────────────────────────
// Captured once at startup; sliders are offsets FROM this state (all-zero = default view).
const _defCamPos = camera.position.clone();
const _defTarget = controls.orbit.target.clone();
const _defSph    = new THREE.Spherical().setFromVector3(
    new THREE.Vector3().subVectors(_defCamPos, _defTarget)
);

// Shared slider mappings — all sliders are deltas, 0 = no change from default
const camMappings = [
    {
        sliderId: "sHeight", valueId: "vHeight", key: "height",
        format: (v) => Number(v).toFixed(1),
    },
    {
        sliderId: "sRot", valueId: "vRot", key: "rotation",
        format: (v) => Math.round(v * 180 / Math.PI) + "°",
    },
    {
        sliderId: "sScale", valueId: "vScale", key: "scale",
        format: (v) => Number(v).toFixed(1),
    },
    {
        sliderId: "sTilt", valueId: "vTilt", key: "tilt",
        format: (v) => Math.round(v * 180 / Math.PI) + "°",
    },
];

// Camera control — all four sliders are offsets from the captured default view.
// Height  : parallel-shifts the view up/down (target.y + delta, camera follows).
// Rotation: azimuth (theta) offset — left/right orbit.
// Distance: radius offset — zoom in/out.
// Tilt     : polar angle (phi) offset — up/down tilt.
function applyFromSliders() {
    const dH = parseFloat(document.getElementById("sHeight")?.value) || 0;
    const dR = parseFloat(document.getElementById("sRot")?.value)    || 0;
    const dS = parseFloat(document.getElementById("sScale")?.value)  || 0;
    const dT = parseFloat(document.getElementById("sTilt")?.value)   || 0;

    const targetY = _defTarget.y + dH;
    const theta   = _defSph.theta + dR;
    const radius  = Math.max(1, _defSph.radius + dS);
    const phi     = Math.max(0.05, Math.min(Math.PI - 0.05, _defSph.phi + dT));

    controls.orbit.target.y = targetY;
    camera.position
        .setFromSpherical(new THREE.Spherical(radius, phi, theta))
        .add(controls.orbit.target);
    controls.orbit.update();
}

["sHeight", "sRot", "sScale", "sTilt"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", applyFromSliders);
});

// Apply default slider values immediately on startup
applyFromSliders();

// Reset: zero all sliders and restore the exact default camera view
function resetCamera() {
    ["sHeight", "sRot", "sScale", "sTilt"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = "0";
            el.dispatchEvent(new Event("input", { bubbles: true }));
        }
    });
    controls.orbit.target.copy(_defTarget);
    camera.position.copy(_defCamPos);
    camera.lookAt(controls.orbit.target);
    controls.orbit.update();
}

document.getElementById("btnResetCamera")?.addEventListener("click", resetCamera);

//init params sender
paramsUiHandle = initParamsUi({
    warp: {
        sendParams: () => false,
    },
    throttle: 50,
    sendAll: true,
    mappings: camMappings,
});

//init chat sender (sidebar)
initChatUi({
    warp: {
        sendParams: (p) => warpClientInstance ? warpClientInstance.sendParams(p) : false,
    },
    getBaseParams: () => paramsUiHandle.currentParams,
});

//init chat sender (right panel)
initChatUi({
    warp: {
        sendParams: (p) => warpClientInstance ? warpClientInstance.sendParams(p) : false,
    },
    getBaseParams: () => paramsUiHandle.currentParams,
    inputId: "rightChatInput",
    sendBtnId: "rightChatSend",
    messagesId: "rightChatMessages",
});

function initWarp(roomKey) {
    clearWarpGeometries();
    setLoadingVisible(true);
    setLoadingProgress(0, "Connecting…");

    if (warpClientInstance) {
        try { warpClientInstance.close(); } catch { }
        warpClientInstance = null;
    }

    currentRoom = roomKey;

    warpClientInstance = createWarpClient({
        relayBase: URL_MAIN,
        room: roomKey,

        onStatus: (state, info) => {
            if (statusText) statusText.innerText = `${state}`;
            setDotState(state);

            if (state === "connected") {
                setLoadingVisible(true);
                setLoadingProgress(0, "Waiting for mesh…");

                if (paramsUiHandle) {
                    setTimeout(() => {
                        paramsUiHandle.pushAll();
                    }, 0);
                }
            }

            if (state === "disconnected" || state === "error" || state === "bad_binary" || state === "bad_json") {
                setLoadingVisible(false);
            }
        },

        onProgress: (p, meta) => {
            if (meta?.state === "idle") {
                setLoadingVisible(false);
                return;
            }
            setLoadingVisible(true);

            if (meta?.state === "begin") {
                setLoadingProgress(0, "Loading 0%");
            } else if (meta?.state === "downloading") {
                setLoadingProgress(p, `Loading ${Math.round(p * 100)}%`);
            } else if (meta?.state === "parsing") {
                setLoadingProgress(0.95, "Parsing…");
            } else if (meta?.state === "decompressing") {
                setLoadingProgress(0.96, "Unzipping…");
            } else if (meta?.state === "done") {
                setLoadingProgress(1, "Done");
                setTimeout(() => setLoadingVisible(false), 200);
            }
        },

        onMesh: (payload) => {
            const geometries = payload?.geometries || [];
            setWarpGeometries(geometries);
        },
    });

    paramsUiHandle = initParamsUi({
        warp: {
            sendParams: (p) => warpClientInstance ? warpClientInstance.sendParams(p) : false,
        },
        throttle: 50,
        sendAll: true,
        mappings: camMappings,
    });
}

// Initial startup
initWarp(initialRoom);

// Per-frame viewport resize — handles smooth sidebar CSS transition
let _lastVpW = 0, _lastVpH = 0;
function checkViewportResize() {
    const w = vpW(), h = vpH();
    if (w !== _lastVpW || h !== _lastVpH) {
        _lastVpW = w; _lastVpH = h;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        composer.setSize(w, h);
        outlinePass.setSize(w, h);
        if (gtaoPass?.setSize) gtaoPass.setSize(w, h);
        fxaaPass.material.uniforms["resolution"].value.set(
            1 / (w * renderer.getPixelRatio()),
            1 / (h * renderer.getPixelRatio())
        );
    }
}

function animate() {
    requestAnimationFrame(animate);
    checkViewportResize();
    controls.update();
    composer.render();
}
animate();

window.addEventListener("resize", () => {
    camera.aspect = vpW() / vpH();
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(vpW(), vpH());
    composer.setSize(vpW(), vpH());
    outlinePass.setSize(vpW(), vpH());

    fxaaPass.material.uniforms["resolution"].value.set(
        1 / (vpW() * (renderer.getPixelRatio ? renderer.getPixelRatio() : 1)),
        1 / (vpH() * (renderer.getPixelRatio ? renderer.getPixelRatio() : 1))
    );

    if (gtaoPass && gtaoPass.setSize) gtaoPass.setSize(vpW(), vpH());
});
