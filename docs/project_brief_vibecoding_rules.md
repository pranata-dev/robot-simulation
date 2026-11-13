# Project Brief: Interactive 3D Physics & Robotics Simulation Lab

## 1. Product Vision
Platform e-learning ini memiliki dua fitur simulasi interaktif berbasis WebGL/3D sebagai pembeda utama di pasar edukasi teknologi:
1. **Modul Simulasi Fisika Dasar (Reguler/Free Tier):** Ruang eksperimen interaktif untuk memahami konsep mekanika klasik (kinematika, dinamika, gravitasi $g = 9.81\text{ m/s}^2$, gaya gesek $\mu$, tumbukan, dan torsi $\tau = r \times F$).
2. **Modul Perakitan & Simulasi Robot Laba-Laba 3D (Premium Tier):** Laboratorium robotika virtual di mana pengguna merakit robot *quadruped* (4 kaki, $8\text{ DOF}$ / *Degrees of Freedom*) dari nol—mulai dari memasang sasis, menempatkan motor servo, memasang mikrokontroler ESP32, menyambungkan kabel jumper antar pin secara 3D, hingga menjalankan kode program untuk menggerakkan robot di atas medan berfisika.

---

## 2. Core User Flow (Robotics Lab)
Pengguna berinteraksi melalui 4 mode utama secara berurutan:
1. **`ASSEMBLY_MODE` (Perakitan Mekanik):**
   - Pengguna menarik (*drag-and-drop*) komponen dari *Inventory Panel* ke dalam *3D Workspace*.
   - Komponen yang didekatkan ke titik pasang (*socket*) dengan jarak Euclidean $d < 0.25\text{ unit}$ akan otomatis menempel (*magnetic snapping*) dengan orientasi rotasi yang terkunci.
2. **`WIRING_MODE` (Instalasi Kabel & Elektronik):**
   - Kamera dapat melakukan *zoom-in* ke papan mikrokontroler ESP32, *Servo Expansion Shield*, baterai LiPo, dan konektor servo.
   - Pengguna mengklik Pin A (misal: `ESP32_GPIO_13`) lalu mengklik Pin B (misal: `SERVO_FL_HIP_PWM`) untuk merender kabel 3D berbasis kurva *Catmull-Rom* atau *Cubic Bezier*.
3. **`CODING_MODE` (Pemrograman Logika & Gait):**
   - Pengguna menulis logika pergerakan menggunakan blok visual atau JavaScript/Arduino-style *subset* API (misal: `setServoAngle(pin, angle)` atau `delay(ms)`).
4. **`SIMULATION_MODE` (Uji Coba Fisika Aktif):**
   - Sistem memvalidasi rangkaian elektronik (apakah $\text{VCC}$ dan $\text{GND}$ terhubung, serta apakah pin $\text{PWM}$ sesuai).
   - *Physics engine* diaktifkan. Robot jatuh ke lantai karena gravitasi dan mulai mengeksekusi sudut target motor servo ($\theta \in [0^\circ, 180^\circ]$) untuk berjalan.

---

## 3. Strict Vibecoding Rules for AI Agent (Antigravity)
Sebagai AI Assistant yang menulis kode untuk proyek ini, **PATUHI ATURAN MUTLAK BERIKUT**:

### A. Separation of Concerns (3D vs UI)
- **JANGAN PERNAH** mencampur elemen DOM HTML biasa di dalam pohon komponen `<Canvas>` milik React Three Fiber (kecuali dibungkus dengan `<Html>` dari `@react-three/drei` untuk label pin).
- Semua HUD, tombol kontrol, *inventory sidebar*, dan *code editor* harus berada di lapisan *Overlay UI* (`position: absolute` di atas `<Canvas>`).

### B. Performance & 60 FPS Render Loop
- **DILARANG KERAS** memanggil `useState` atau memicu *React re-render* di dalam *hook* `useFrame((state, delta) => ...)`.
- Untuk memperbarui posisi *drag*, sudut rotasi servo, atau kalkulasi fisika setiap *frame* ($\Delta t \approx 16.67\text{ ms}$), mutasi langsung referensi objek (`meshRef.current.rotation.y = ...`) atau baca *state* Zustand secara transien menggunakan `useSimulatorStore.getState()`.

### C. Procedural Proxy Fallback First
- Jangan pernah memblokir progres *coding* hanya karena file `.glb` atau `.gltf` belum tersedia di folder `/public/models`.
- Selalu sediakan komponen **Procedural Mesh Proxy** (menggunakan gabungan `<boxGeometry>`, `<cylinderGeometry>`, dan `<meshStandardMaterial>`) yang memiliki struktur hirarki `<group>` dan nama *socket* yang $100\%$ identik dengan spesifikasi di `3d-asset-map.md`.

### D. Code Style & Modularity
- Gunakan TypeScript secara ketat (`strict: true`). Hindari penggunaan tipe `any`.
- Gunakan *functional components* dan *custom hooks*.
- Setiap file komponen tidak boleh melebihi $250\text{ baris}$ kode. Jika lebih, pecah menjadi sub-komponen atau *helper hooks*.