import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';


// --- הגדרות גלובליות ---
let scene, camera, renderer, controls;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let plane; // מישור גרירה בלתי נראה
let draggableObjects = [];
let physicsObjects = [];
let magneticFieldSources = [];
let electricFieldLines = [];
let draggedObject = null;
const forceConstant = 20; // עוצמת הכוח החשמלי
const damping = 0.96;

// --- מחלקות אובייקטים ---

class PhysicsObject {
    constructor(mesh) {
        this.mesh = mesh;
        this.velocity = new THREE.Vector3();
        this.force = new THREE.Vector3();
    }
    update() {
        // פיזיקה בסיסית
        const mass = this.mesh.userData.mass || 1;
        const acceleration = this.force.clone().divideScalar(mass);
        this.velocity.add(acceleration);
        this.velocity.multiplyScalar(damping);
        this.mesh.position.add(this.velocity);
        this.force.set(0, 0, 0); // איפוס כוח אחרי כל עדכון
    }
}

class ChargedParticle extends PhysicsObject {
    constructor(mesh, charge) {
        super(mesh);
        this.charge = charge;
    }
}

class Wire extends PhysicsObject {
    constructor(mesh) {
        super(mesh);
        this.current = 0; // 0=off, 1=positive, -1=negative direction
        this.fieldLines = [];
        this.createFieldVisual();
        magneticFieldSources.push(this);
    }
    
    getMagneticFieldAt(point) {
        const localPoint = this.mesh.worldToLocal(point.clone());
        if (Math.abs(localPoint.x) > 5) return new THREE.Vector3();
        
        const rVec = new THREE.Vector3(0, localPoint.y, localPoint.z);
        const r = rVec.length();
        if (r < 0.1) return new THREE.Vector3();

        const B_magnitude = (0.5 * this.current) / r;
        const B_direction = new THREE.Vector3(-this.current, 0, 0).cross(rVec).normalize();
        
        return B_direction.multiplyScalar(B_magnitude).applyQuaternion(this.mesh.quaternion);
    }

    createFieldVisual() {
        const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0, side: THREE.DoubleSide });
        for(let i=1; i<=5; i++) {
            const ringGeometry = new THREE.TorusGeometry(i * 0.4, 0.02, 16, 100);
            const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
            ring.rotation.x = Math.PI / 2;
            this.fieldLines.push(ring);
            this.mesh.add(ring);
        }
    }
    
    update() {
        super.update();
        const intensity = Math.abs(this.current);
        this.fieldLines.forEach(ring => ring.material.opacity = intensity * 0.5);
    }
}

class BarMagnet extends PhysicsObject {
     constructor(mesh) {
        super(mesh);
        this.strength = 5;
        magneticFieldSources.push(this);
        // ... ויזואליזציה של שדה מגנטי (יכולה להיות מורכבת)
    }
     getMagneticFieldAt(point) {
        // מודל דיפול פשוט
        const localPoint = this.mesh.worldToLocal(point.clone());
        const poleDist = this.mesh.geometry.parameters.height * 0.8;
        const posPole = new THREE.Vector3(0, poleDist / 2, 0);
        const negPole = new THREE.Vector3(0, -poleDist / 2, 0);

        const r_pos = new THREE.Vector3().subVectors(localPoint, posPole);
        const r_neg = new THREE.Vector3().subVectors(localPoint, negPole);

        const B_pos = r_pos.clone().multiplyScalar(this.strength / Math.pow(r_pos.length(), 3));
        const B_neg = r_neg.clone().multiplyScalar(-this.strength / Math.pow(r_neg.length(), 3));

        const B_total_local = new THREE.Vector3().addVectors(B_pos, B_neg);
        return B_total_local.applyQuaternion(this.mesh.quaternion);
    }
}


// --- אתחול ---
function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 8, 15);

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('sandbox-canvas'), antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // תאורה וסביבה
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);
    scene.add(new THREE.GridHelper(40, 40, 0xaaaaaa, 0x555555));

    // מישור גרירה
    plane = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);

    bindEvents();
    animate();
}

// --- יצירת אובייקטים ---
function addObject(type) {
    let mesh;
    let physicsObj;
    switch(type) {
        case 'proton':
            mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0xff4d6d }));
            physicsObj = new ChargedParticle(mesh, 1);
            break;
        case 'electron':
            mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0x4da6ff }));
            mesh.userData.mass = 0.1; // אלקטרון קל יותר
            physicsObj = new ChargedParticle(mesh, -1);
            break;
        case 'wire':
            mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 10, 16), new THREE.MeshStandardMaterial({ color: 0xb87333 }));
            mesh.rotation.z = Math.PI / 2;
            mesh.userData.mass = 10;
            physicsObj = new Wire(mesh);
            document.getElementById('wire-controls').classList.remove('hidden');
            break;
        case 'magnet':
             const magnetGeom = new THREE.BoxGeometry(1, 2, 0.5);
             const northMat = new THREE.MeshStandardMaterial({ color: 0xff4d6d });
             const southMat = new THREE.MeshStandardMaterial({ color: 0x4da6ff });
             const neutralMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
             magnetGeom.groups.push({ start: 0, count: 12, materialIndex: 2 }); // side
             magnetGeom.groups.push({ start: 12, count: 6, materialIndex: 0 }); // top (north)
             magnetGeom.groups.push({ start: 18, count: 6, materialIndex: 1 }); // bottom (south)
             mesh = new THREE.Mesh(magnetGeom, [northMat, southMat, neutralMat]);
             mesh.userData.mass = 20;
             physicsObj = new BarMagnet(mesh);
             break;
    }
    
    if (mesh) {
        mesh.position.y = mesh.geometry.parameters.height ? mesh.geometry.parameters.height / 2 : 0.3;
        scene.add(mesh);
        draggableObjects.push(mesh);
        physicsObjects.push(physicsObj);
    }
}

function createFieldLine(points) {
    const geometry = new LineGeometry();
    geometry.setPositions(points);
    const material = new LineMaterial({ color: 0xffff00, linewidth: 0.002, transparent: true, opacity: 0.5 });
    const line = new Line2(geometry, material);
    scene.add(line);
    return line;
}

// --- לולאת אנימציה ופיזיקה ---
function animate() {
    requestAnimationFrame(animate);

    // פיזיקה
    // 1. כוחות חשמליים
    for (let i = 0; i < physicsObjects.length; i++) {
        for (let j = i + 1; j < physicsObjects.length; j++) {
            const p1 = physicsObjects[i];
            const p2 = physicsObjects[j];
            if (p1 instanceof ChargedParticle && p2 instanceof ChargedParticle) {
                const vec = new THREE.Vector3().subVectors(p1.mesh.position, p2.mesh.position);
                const distSq = vec.lengthSq();
                if (distSq > 0.1) {
                    const forceMag = -forceConstant * (p1.charge * p2.charge) / distSq;
                    const forceVec = vec.normalize().multiplyScalar(forceMag);
                    p1.force.add(forceVec);
                    p2.force.sub(forceVec);
                }
            }
        }
    }
    
    // 2. כוחות מגנטיים
    const totalB = new THREE.Vector3();
    physicsObjects.forEach(p => {
        totalB.set(0,0,0);
        magneticFieldSources.forEach(source => {
            totalB.add(source.getMagneticFieldAt(p.mesh.position));
        });

        if (p instanceof ChargedParticle && p.velocity.lengthSq() > 0.0001) {
            // כוח לורנץ על חלקיקים
            const lorentzForce = new THREE.Vector3().crossVectors(p.velocity, totalB).multiplyScalar(p.charge);
            p.force.add(lorentzForce);
        }
        if (p instanceof Wire && p.current !== 0) {
            // כוח על תיל
            const wireDirection = new THREE.Vector3(-1, 0, 0).applyQuaternion(p.mesh.quaternion);
            const wireForce = new THREE.Vector3().crossVectors(wireDirection, totalB).multiplyScalar(p.current * 10); // 10 is length
            p.force.add(wireForce);
        }
    });

    // עדכון מיקומים
    physicsObjects.forEach(p => p.update());

    // עדכון ויזואליזציה של שדות
    electricFieldLines.forEach(l => scene.remove(l));
    electricFieldLines = [];
    const charged = physicsObjects.filter(p => p instanceof ChargedParticle);
    for (let i = 0; i < charged.length; i++) {
        for (let j = i + 1; j < charged.length; j++) {
             const p1 = charged[i];
             const p2 = charged[j];
             if(p1.charge * p2.charge < 0) { // רק למשיכה
                 electricFieldLines.push(createFieldLine([...p1.mesh.position.toArray(), ...p2.mesh.position.toArray()]));
             }
        }
    }

    controls.update();
    renderer.render(scene, camera);
}


// --- אירועים ---
function bindEvents() {
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    document.querySelectorAll('.tool-item').forEach(el => {
        el.addEventListener('click', () => addObject(el.dataset.type));
    });
    
    document.getElementById('reset-btn').addEventListener('click', () => {
        physicsObjects.forEach(p => scene.remove(p.mesh));
        electricFieldLines.forEach(l => scene.remove(l));
        physicsObjects = [];
        draggableObjects = [];
        magneticFieldSources = [];
        electricFieldLines = [];
        document.getElementById('wire-controls').classList.add('hidden');
    });

    document.getElementById('current-slider').addEventListener('input', e => {
        const wireObj = physicsObjects.find(p => p instanceof Wire);
        if(wireObj) wireObj.current = (e.target.value - 50) / 50; // טווח -1 עד 1
    });

    // גרירה
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
}

function onPointerDown(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(draggableObjects);
    if (intersects.length > 0) {
        controls.enabled = false;
        draggedObject = intersects[0].object;
        plane.position.copy(draggedObject.position);
        plane.lookAt(camera.position);
    }
}

function onPointerMove(event) {
    if (!draggedObject) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(plane);
    if (intersects.length > 0) {
        draggedObject.position.copy(intersects[0].point);
        // שמירה על גובה קבוע לאובייקטים פשוטים
        if (draggedObject.geometry.type === 'SphereGeometry') {
            draggedObject.position.y = draggedObject.geometry.parameters.radius;
        } else if (draggedObject.geometry.type === 'BoxGeometry') {
             draggedObject.position.y = draggedObject.geometry.parameters.height / 2;
        }
    }
}

function onPointerUp() {
    controls.enabled = true;
    draggedObject = null;
}

// --- התחלה ---
init();