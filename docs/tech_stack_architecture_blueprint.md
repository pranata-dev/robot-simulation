# Tech Stack & Architecture Standards

## 1. Core Technology Stack
- **Framework:** Next.js (App Router, React 18/19, TypeScript)
- **Styling & UI Overlay:** Tailwind CSS, Lucide React (Icons), Framer Motion (UI animations)
- **3D Rendering Engine:**
  - `three` & `@types/three` (Core WebGL library)
  - `@react-three/fiber` (React reconciler for Three.js)
  - `@react-three/drei` (Helpers: `OrbitControls`, `TransformControls`, `QuadraticBezierLine`, `Html`, `Grid`, `Environment`)
- **Physics Engine:**
  - `@react-three/rapier` (WebAssembly-based rigid body physics, colliders, and revolute/prismatic joints)
- **State Management:**
  - `zustand` (Global state store for assembly tree, wiring graph, and simulation telemetry)
- **Code Editor (In-App IDE):**
  - `@monaco-editor/react` (Editor kode untuk memprogram mikrokontroler)

---

## 2. Directory Structure
AI harus mematuhi struktur direktori berikut saat membuat file baru:

```text
src/
├── app/
│   ├── lab/
│   │   ├── physics/
│   │   │   └── page.tsx          # Halaman Simulasi Fisika Dasar (Free Tier)
│   │   └── robotics/
│   │       └── page.tsx          # Halaman Perakitan Robot Laba-Laba (Premium Tier)
├── components/
│   ├── canvas/                   # SEMUA KOMPONEN R3F (Di dalam <Canvas>)
│   │   ├── SceneContainer.tsx    # Setup Canvas, Lighting, Grid, OrbitControls, Physics
│   │   ├── parts/                # Komponen 3D per part (Chassis, ESP32, Servo, Leg)
│   │   │   ├── ChassisMesh.tsx
│   │   │   ├── Esp32Mesh.tsx
│   │   │   ├── ServoMg90sMesh.tsx
│   │   │   └── SpiderLegMesh.tsx
│   │   ├── assembly/
│   │   │   ├── SocketIndicator.tsx   # Visualisasi titik snap magnetik
│   │   │   └── DraggablePart.tsx     # Wrapper untuk Raycasting & Dragging 3D
│   │   ├── wiring/
│   │   │   ├── PinNode.tsx           # Titik interaktif untuk klik pin GPIO/Servo
│   │   │   └── WireCurve3D.tsx       # Render kabel 3D dengan QuadraticBezierLine
│   │   └── physics/
│   │       ├── AssembledRobotRig.tsx # Hirarki RigidBody & useRevoluteJoint saat mode Simulate
│   │       └── InclinedPlaneLab.tsx  # Komponen simulasi fisika dasar
│   └── ui/                       # SEMUA KOMPONEN HTML/TAILWIND (Di luar <Canvas>)
│       ├── TopToolbar.tsx        # Switcher Mode: Assembly | Wiring | Coding | Simulate
│       ├── PartInventory.tsx     # Sidebar daftar komponen untuk ditambahkan ke scene
│       ├── WiringInspector.tsx   # Tabel daftar koneksi kabel aktif & tombol hapus
│       ├── CodeEditorDrawer.tsx  # Panel Monaco Editor untuk menulis program robot
│       └── TelemetryHUD.tsx      # Grafik sudut servo, konsumsi arus, & koordinat COM
├── store/
│   └── useSimulatorStore.ts      # Zustand store utama (mengacu pada state-management.md)
├── lib/
│   ├── kinematics/
│   │   └── spiderGait.ts         # Kalkulasi Inverse Kinematics & Tripod Gait generator
│   ├── microcontroller/
│   │   ├── circuitValidator.ts   # Validasi koneksi VCC, GND, dan PWM sebelum simulasi
│   │   └── sandboxRunner.ts      # Interpreter aman untuk mengeksekusi kode user
│   └── constants/
│       └── socketRegistry.ts     # Data koordinat socket dari 3d-asset-map.md
└── types/
    └── simulator.ts              # Definisi interface TypeScript global
```

---

## 3. Architectural Patterns & Best Practices

### A. Next.js App Router Boundary (`'use client'`)
Semua komponen yang mengimpor `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, atau `zustand` **WAJIB** mendeklarasikan `'use client'` di baris paling atas. Halaman utama (`page.tsx`) sebaiknya memuat `SceneContainer` secara dinamis dengan `ssr: false` untuk mencegah *hydration error* terkait WebGL/WASM:
```tsx
import dynamic from 'next/dynamic';
const SceneContainer = dynamic(() => import('@/components/canvas/SceneContainer'), { ssr: false });
```

### B. Dual-Representation Pattern (Edit vs. Simulate)
Di dalam engine 3D, memanipulasi posisi objek *RigidBody* secara bebas saat *user* melakukan *drag-and-drop* sering berkonflik dengan kalkulasi *solver* fisika. Oleh karena itu, gunakan pola **Dual-Representation**:
1. **Saat `mode !== 'simulate'` (`assembly`, `wiring`, `coding`):**
   Render komponen sebagai `<group>` dan `<mesh>` Three.js murni tanpa *physics solver* aktif (`<Physics paused={true}>`). Ini memastikan *drag-and-drop*, rotasi, dan *snapping* berjalan mulus tanpa gangguan gravitasi.
2. **Saat `mode === 'simulate'`:**
   Kunci seluruh modifikasi perakitan, aktifkan `<Physics paused={false} gravity={[0, -9.81, 0]}>`, dan instansiasi *RigidBody* beserta *RevoluteJoint* berdasarkan pohon rakitan yang sudah tervalidasi.

### C. Coordinate System Convention
- Gunakan sistem koordinat **Right-Handed, Y-Up** standar Three.js:
  - Sumbu $+X$: Kanan (*Right*)
  - Sumbu $-X$: Kiri (*Left*)
  - Sumbu $+Y$: Atas (*Up* / melawan arah gravitasi)
  - Sumbu $+Z$: Depan (*Forward* / arah kepala robot)
  - Sumbu $-Z$: Belakang (*Backward* / arah ekor robot)
- Semua satuan panjang di dalam *canvas* direpresentasikan dalam skala $1\text{ unit} = 10\text{ cm}$ ($0.1\text{ m}$) agar presisi *floating-point* di Rapier Physics tetap optimal dan kamera tidak mengalami *near-plane clipping*.