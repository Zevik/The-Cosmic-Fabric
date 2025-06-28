document.addEventListener('DOMContentLoaded', () => {

    // --- הגדרות ומשתנים ---
    const canvas = document.getElementById('molecule-canvas');
    const ctx = canvas.getContext('2d');
    const atomSources = document.querySelectorAll('.atom-source');
    const resetButton = document.getElementById('reset-btn');
    const successModal = document.getElementById('success-modal');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let audioContext;
    let atoms = [];
    let bonds = [];
    let draggedAtom = null;
    let dragOffset = { x: 0, y: 0 };
    let puzzleSolved = false;

    const ATOM_PROPERTIES = {
        hydrogen: {
            radius: 20, color: 'var(--hydrogen-color)', text: 'H',
            slots: [{ angle: 0, occupied: false }]
        },
        oxygen: {
            radius: 30, color: 'var(--oxygen-color)', text: 'O',
            slots: [{ angle: -1.823, occupied: false }, { angle: 1.823, occupied: false }] // ~104.5 degrees
        }
    };
    
    // --- לוגיקת המשחק ---
    function createAtom(type, x, y) {
        const props = ATOM_PROPERTIES[type];
        const atom = {
            id: Date.now() + Math.random(), type, x, y,
            radius: props.radius, color: getCssVar(props.color), text: props.text,
            rotation: 0,
            slots: JSON.parse(JSON.stringify(props.slots)), // Deep copy
            bonds: [],
            vibrate: 0
        };
        atoms.push(atom);
        return atom;
    }
    
    function reset() {
        atoms = [];
        bonds = [];
        puzzleSolved = false;
        successModal.classList.add('hidden');
        successModal.style.opacity = '0';
    }

    function checkWinCondition() {
        const oxygenAtoms = atoms.filter(a => a.type === 'oxygen');
        if (oxygenAtoms.length !== 1) return false;
        
        const oxygen = oxygenAtoms[0];
        if (oxygen.bonds.length !== 2) return false;

        const bondedAtoms = oxygen.bonds.map(bondId => bonds.find(b => b.id === bondId)).map(bond => bond.atom2);
        const areBothHydrogen = bondedAtoms.every(atomId => atoms.find(a => a.id === atomId).type === 'hydrogen');

        if (areBothHydrogen) {
            puzzleSolved = true;
            playSound('success');
            // אנימציית הצלחה
            const waterMoleculeAtoms = [oxygen, ...bondedAtoms.map(id => atoms.find(a => a.id === id))];
            centerAndShowSuccess(waterMoleculeAtoms);
        }
    }

    function centerAndShowSuccess(moleculeAtoms) {
        // המודל יופיע אחרי שהאנימציה מסתיימת
        setTimeout(() => {
            successModal.classList.remove('hidden');
            setTimeout(() => successModal.style.opacity = '1', 10);
        }, 1500);
    }
    

    // --- פונקציות ציור ---
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        bonds.forEach(drawBond);
        atoms.forEach(drawAtom);

        if (puzzleSolved) {
            drawPolarityAnimation();
        }

        requestAnimationFrame(draw);
    }

    function drawAtom(atom) {
        ctx.save();
        ctx.translate(atom.x, atom.y);
        ctx.rotate(atom.rotation);

        if(atom.vibrate > 0) {
            ctx.translate((Math.random()-0.5)*4, (Math.random()-0.5)*4);
            atom.vibrate--;
        }

        // צל
        ctx.beginPath();
        ctx.arc(0, 0, atom.radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // גוף האטום
        ctx.beginPath();
        ctx.arc(0, 0, atom.radius, 0, Math.PI * 2);
        ctx.fillStyle = atom.color;
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();

        // ציור נקודות עגינה
        if (!puzzleSolved) {
            atom.slots.forEach(slot => {
                if (!slot.occupied) {
                    const slotX = Math.cos(slot.angle) * (atom.radius + 10);
                    const slotY = Math.sin(slot.angle) * (atom.radius + 10);
                    ctx.beginPath();
                    ctx.arc(slotX, slotY, 5, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
                    ctx.fill();
                }
            });
        }

        // טקסט
        ctx.rotate(-atom.rotation); // ביטול הסיבוב לטקסט
        ctx.fillStyle = '#111';
        ctx.font = `bold ${atom.radius}px ${getCssVar('--font-title')}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(atom.text, 0, 0);

        ctx.restore();
    }
    
    function drawBond(bond) {
        const atom1 = atoms.find(a => a.id === bond.atom1);
        const atom2 = atoms.find(a => a.id === bond.atom2);
        if (!atom1 || !atom2) return;
        
        ctx.beginPath();
        ctx.moveTo(atom1.x, atom1.y);
        ctx.lineTo(atom2.x, atom2.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 8;
        ctx.stroke();
    }
    
    let polarityPhase = 0;
    function drawPolarityAnimation() {
        polarityPhase += 0.02;
        const oxygen = atoms.find(a => a.type === 'oxygen');
        if (!oxygen) return;
        
        const opacity = Math.abs(Math.sin(polarityPhase)) * 0.7;

        // מטען שלילי על חמצן
        ctx.fillStyle = `rgba(77, 166, 255, ${opacity})`;
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText('δ-', oxygen.x + 30, oxygen.y - 30);

        // מטענים חיוביים על מימנים
        const hydrogens = atoms.filter(a => a.type === 'hydrogen');
        hydrogens.forEach(h => {
             ctx.fillStyle = `rgba(255, 77, 109, ${opacity})`;
             ctx.fillText('δ+', h.x + 20, h.y - 20);
        });
    }

    // --- אירועים ואינטראקציה ---
    function onMouseDown(e) {
        initAudio();
        const mouse = getMousePos(e);
        
        // בדיקת גרירה מאטום קיים
        draggedAtom = atoms.slice().reverse().find(atom => distance(mouse, atom) < atom.radius);
        if (draggedAtom) {
            dragOffset.x = mouse.x - draggedAtom.x;
            dragOffset.y = mouse.y - draggedAtom.y;
            // נתק קשרים אם גוררים אטום מתוך מולקולה (למעט אם הפאזל נפתר)
            if (!puzzleSolved) severBonds(draggedAtom);
            return;
        }
    }

    function onAtomSourceDown(e) {
        initAudio();
        const type = e.currentTarget.dataset.type;
        draggedAtom = createAtom(type, -100, -100); // צור מחוץ למסך
        onMouseMove(e); // עדכן מיקום מיידית
    }

    function onMouseMove(e) {
        if (!draggedAtom) return;
        const mouse = getMousePos(e);
        
        const group = getMoleculeGroup(draggedAtom);
        const dx = (mouse.x - dragOffset.x) - group.center.x;
        const dy = (mouse.y - dragOffset.y) - group.center.y;
        
        group.atoms.forEach(atom => {
            atom.x += dx;
            atom.y += dy;
        });
    }

    function onMouseUp(e) {
        if (!draggedAtom) return;
        
        let snapped = false;
        for (const targetAtom of atoms) {
            if (targetAtom.id === draggedAtom.id) continue;
            for (const targetSlot of targetAtom.slots) {
                if (targetSlot.occupied) continue;
                
                const targetSlotPos = {
                    x: targetAtom.x + Math.cos(targetSlot.angle + targetAtom.rotation) * (targetAtom.radius + 10),
                    y: targetAtom.y + Math.sin(targetSlot.angle + targetAtom.rotation) * (targetAtom.radius + 10)
                };

                if (distance(draggedAtom, targetSlotPos) < 30) {
                    const mySlot = draggedAtom.slots.find(s => !s.occupied);
                    if (mySlot) {
                        snap(draggedAtom, mySlot, targetAtom, targetSlot);
                        snapped = true;
                        break;
                    }
                }
            }
            if(snapped) break;
        }

        if(!snapped && !draggedAtom.bonds.length > 0) playSound('error');

        draggedAtom = null;
        if (!puzzleSolved) checkWinCondition();
    }
    
    function snap(atom1, slot1, atom2, slot2) {
        playSound('snap');
        // סובב את אטום 1 כך שהסלוט שלו יפנה לאטום 2
        const angleToTarget = Math.atan2(atom2.y - atom1.y, atom2.x - atom1.x);
        atom1.rotation = angleToTarget - slot1.angle;

        // הצמד את אטום 1 למיקום הנכון ליד אטום 2
        const finalAngle = slot2.angle + atom2.rotation;
        const bondLength = atom1.radius + atom2.radius + 15;
        atom1.x = atom2.x + Math.cos(finalAngle) * bondLength;
        atom1.y = atom2.y + Math.sin(finalAngle) * bondLength;
        
        // עדכן שהסלוטים תפוסים וצור קשר
        slot1.occupied = true;
        slot2.occupied = true;
        const bond = { id: Date.now(), atom1: atom1.id, atom2: atom2.id };
        bonds.push(bond);
        atom1.bonds.push(bond.id);
        atom2.bonds.push(bond.id);
    }
    
    function severBonds(atom) {
        atom.bonds.forEach(bondId => {
            const bond = bonds.find(b => b.id === bondId);
            if (!bond) return;
            const otherAtomId = bond.atom1 === atom.id ? bond.atom2 : bond.atom1;
            const otherAtom = atoms.find(a => a.id === otherAtomId);
            
            // שחרר את הסלוטים
            atom.slots.find(s => s.occupied).occupied = false;
            if(otherAtom) {
                otherAtom.slots.find(s => s.occupied).occupied = false;
                otherAtom.bonds = otherAtom.bonds.filter(id => id !== bondId);
            }
            bonds = bonds.filter(b => b.id !== bondId);
        });
        atom.bonds = [];
        atom.vibrate = 10; // הפעל רטט קצר
        playSound('error');
    }
    
    function getMoleculeGroup(startAtom) {
        let group = new Set([startAtom]);
        let toCheck = [startAtom];
        while (toCheck.length > 0) {
            const current = toCheck.pop();
            current.bonds.forEach(bondId => {
                const bond = bonds.find(b => b.id === bondId);
                const otherAtomId = bond.atom1 === current.id ? bond.atom2 : bond.atom1;
                const otherAtom = atoms.find(a => a.id === otherAtomId);
                if (otherAtom && !group.has(otherAtom)) {
                    group.add(otherAtom);
                    toCheck.push(otherAtom);
                }
            });
        }
        
        const groupAtoms = [...group];
        const centerX = groupAtoms.reduce((sum, a) => sum + a.x, 0) / groupAtoms.length;
        const centerY = groupAtoms.reduce((sum, a) => sum + a.y, 0) / groupAtoms.length;
        
        return { atoms: groupAtoms, center: {x: centerX, y: centerY}};
    }

    // --- כלי עזר וסאונד ---
    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }
    function distance(p1, p2) { return Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2); }
    function getCssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
    
    function initAudio() {
        if(!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    function playSound(type) {
        if (!audioContext) return;
        const o = audioContext.createOscillator();
        const g = audioContext.createGain();
        o.connect(g);
        g.connect(audioContext.destination);
        g.gain.setValueAtTime(0.2, audioContext.currentTime);

        switch(type) {
            case 'snap': o.type = 'sine'; o.frequency.setValueAtTime(880, audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.2); break;
            case 'error': o.type = 'square'; o.frequency.setValueAtTime(120, audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.15); break;
            case 'success': o.type = 'sine'; o.frequency.setValueAtTime(523, audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 1); o.frequency.linearRampToValueAtTime(1046, audioContext.currentTime + 1); break;
        }
        o.start();
        o.stop(audioContext.currentTime + 1);
    }
    
    // --- חיבור אירועים ---
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    atomSources.forEach(s => s.addEventListener('mousedown', onAtomSourceDown));
    resetButton.addEventListener('click', reset);
    
    // תמיכה במגע
    canvas.addEventListener('touchstart', onMouseDown, {passive: false});
    canvas.addEventListener('touchmove', onMouseMove, {passive: false});
    canvas.addEventListener('touchend', onMouseUp, {passive: false});
    atomSources.forEach(s => s.addEventListener('touchstart', onAtomSourceDown, {passive: false}));

    // --- אתחול ---
    draw();
});