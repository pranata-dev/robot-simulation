# Iterative Vibecoding Roadmap & Prompting Guide

**PENTING:** Jangan pernah meminta AI membangun seluruh aplikasi dalam satu *prompt*. Ikuti 5 fase iteratif di bawah ini secara berurutan. Pastikan setiap fase berjalan tanpa *error* di browser sebelum lanjut ke fase berikutnya.

---

## Fase 1: Foundation, Physics Lab & State Store
**Tujuan:** Menyiapkan arsitektur Next.js, *store* Zustand, halaman simulasi fisika dasar (bidang miring & tumbukan), serta *workspace* 3D untuk laboratorium robotika.

**Deliverables:**
- `src/types/simulator.ts` & `src/store/useSimulatorStore.ts`
- `src/components/canvas/SceneContainer.tsx` (Dilengkapi `OrbitControls`, `Grid`, pencahayaan, dan pembungkus `<Physics>` dari `@react-three/rapier`)
- `src/components/canvas/physics/InclinedPlaneLab.tsx` (Simulasi balok meluncur di bidang miring dengan kontrol sudut $\theta$, massa $m$, dan koefisien gesek $\mu$)
- `src/components/ui/TopToolbar.tsx`

**Prompt untuk Antigravity IDE:**
> *"Baca file `@project-brief.md`, `@tech-stack-and-architecture.md`, dan `@state-management.md`. Kerjakan **Fase 1** dari `@roadmap-phases.md`. Buat definisi tipe TypeScript, Zustand store lengkap, serta SceneContainer R3F. Sediakan toggle di UI untuk berpindah antara 'Physics Sandbox Lab' (simulasi balok pada bidang miring interaktif menggunakan Rapier) dan 'Spider Robotics Lab'."*

---

## Fase 2: Procedural 3D Robot Parts & Magnetic Snapping
**Tujuan:** Membangun komponen 3D untuk ke-6 jenis *part* robot (`CHASSIS_BASE`, `ESP32_DEVKIT`, `BATTERY_2S`, `SERVO_MG90S`, `LEG_COXA`, `LEG_TIBIA`) beserta sistem *drag-and-drop* dan *magnetic socket snapping*.

**Deliverables:**
- `src/lib/constants/socketRegistry.ts` (Implementasi koordinat dari `3d-asset-map.md`)
- Komponen *mesh* prosedural di `src/components/canvas/parts/*` yang tampak detail dan mekanis.
- `src/components/canvas/assembly/SocketIndicator.tsx` (Menampilkan bola transparan hijau menyala saat *user* menarik *part* yang kompatibel di dekat *socket*).
- Fitur tombol **"Load Complete Spider Preset"** di UI agar kita bisa langsung merakit seluruh robot secara otomatis dengan 1 klik untuk mempercepat pengujian fase berikutnya.

**Prompt untuk Antigravity IDE:**
> *"Berdasarkan `@3d-asset-map.md` dan `@state-management.md`, kerjakan **Fase 2** dari `@roadmap-phases.md`. Bangun komponen Procedural 3D Mesh untuk seluruh part robot laba-laba beserta hirarki socket-nya. Implementasikan fitur 3D drag-and-drop pada `ASSEMBLY_MODE` di mana part akan otomatis snap ke socket yang kompatibel jika jaraknya $d < 0.25\text{ unit}$. Tambahkan juga tombol 'Auto-Assemble Robot' di UI."*

---

## Fase 3: 3D Interactive Pin-to-Pin Wiring System
**Tujuan:** Mengizinkan pengguna menyambungkan kabel jumper 3D antara pin GPIO ESP32, baterai, dan motor servo.

**Deliverables:**
- `src/components/canvas/wiring/PinNode.tsx` (Titik *mesh* kecil di atas ESP32 dan Servo yang memunculkan *tooltip* nama pin saat di-*hover* dan bisa diklik saat `WIRING_MODE`).
- `src/components/canvas/wiring/WireCurve3D.tsx` (Menggambar kabel melengkung yang realistis menggunakan `<QuadraticBezierLine>` dari `@react-three/drei` dengan titik kontrol tengah yang ditinggikan pada sumbu $+Y$ agar kabel tidak menembus *mesh* sasis).
- `src/lib/microcontroller/circuitValidator.ts` & tombol **"Auto-Wire Default Pins"** di UI.

**Prompt untuk Antigravity IDE:**
> *"Kerjakan **Fase 3** dari `@roadmap-phases.md` dengan mengacu pada koordinat pin di `@3d-asset-map.md`. Buat sistem `WIRING_MODE` di mana user bisa mengklik Pin A lalu Pin B untuk membuat koneksi kabel 3D menggunakan `QuadraticBezierLine`. Tambahkan panel `WiringInspector` di UI, logika `circuitValidator.ts` untuk mendeteksi short-circuit atau pin yang belum terhubung, serta tombol 'Auto-Wire Preset'."*

---

## Fase 4: Rapier Physics Rig & Revolute Joint Actuation
**Tujuan:** Mengubah robot yang sudah dirakit menjadi struktur fisik aktif di `@react-three/rapier` yang digerakkan oleh sendi motor (*Revolute Joint*).

**Deliverables:**
- `src/components/canvas/physics/AssembledRobotRig.tsx`
- Integrasi *joint* atau kontrol sudut kinematik untuk 8 servo (4 *Hip* + 4 *Knee*).
- Panel penguji manual (*Servo Sliders* $0^\circ - 180^\circ$) di *Telemetry HUD* untuk menguji gerakan tiap kaki secara *real-time* saat berada di `SIMULATION_MODE`.

**Prompt untuk Antigravity IDE:**
> *"Kerjakan **Fase 4** dari `@roadmap-phases.md`. Buat komponen `AssembledRobotRig.tsx` yang aktif saat `mode === 'simulate'`. Pastikan robot berinteraksi dengan gravitasi dan lantai Rapier Physics, serta hubungkan ke-8 motor servo dengan `servoTargetAngles` di Zustand store. Sediakan panel slider manual ($0^\circ$ sampai $180^\circ$) di UI untuk menguji gerakan masing-masing sendi kaki secara langsung."*

---

## Fase 5: Virtual Microcontroller IDE & Tripod Gait Walking
**Tujuan:** Menyediakan editor kode di dalam web dan algoritma jalan laba-laba (*Tripod / Tetrapod Gait*) sehingga pengguna bisa memprogram robotnya untuk berjalan maju, mundur, dan berbelok.

**Deliverables:**
- `src/components/ui/CodeEditorDrawer.tsx`
- `src/lib/microcontroller/sandboxRunner.ts` (Mengeksekusi fungsi asinkron pengguna seperti `await setServo(pin, angle)` dan `await delay(ms)` serta perintah tingkat tinggi seperti `await walkForward(steps)`).
- `src/lib/kinematics/spiderGait.ts` (Sekuen langkah kaki diagonal: mengangkat pasangan kaki $\text{FL} + \text{BR}$, mengayun ke depan, menurunkan, lalu bergantian dengan $\text{FR} + \text{BL}$).

**Prompt untuk Antigravity IDE:**
> *"Kerjakan **Fase 5** dari `@roadmap-phases.md`. Buat `CodeEditorDrawer.tsx` dan `sandboxRunner.ts` agar user dapat menulis kode JavaScript/Arduino-style untuk mengontrol pin GPIO ESP32. Sediakan template kode bawaan di editor yang mengimplementasikan algoritma jalan 'Quadruped Diagonal Gait' sehingga ketika user menekan tombol 'Run Code' di `SIMULATION_MODE`, robot laba-laba benar-benar melangkah maju di atas lantai."*