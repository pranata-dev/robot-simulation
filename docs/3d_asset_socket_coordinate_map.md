# 3D Asset & Socket Coordinate Map

Dokumen ini adalah referensi spasial mutlak untuk AI saat menyusun posisi komponen, titik *snap* (*sockets*), engsel sendi (*joints*), dan titik pin kabel (*pins*).

> **Skala Konvensi:** $1\text{ Three.js Unit} = 10\text{ cm}$ ($100\text{ mm}$).
> Jika ukuran asli sasis robot adalah $120\text{ mm} \times 20\text{ mm} \times 160\text{ mm}$, maka ukuran di dalam R3F adalah $[1.2, 0.2, 1.6]$.

---

## 1. Daftar Komponen Utama (Part Catalog)

| Part Type ID | Nama Tampilan | Dimensi Proxy $[X, Y, Z]$ | Massa ($m$) | Deskripsi Fungsi |
| :--- | :--- | :--- | :--- | :--- |
| `CHASSIS_BASE` | Main Spider Chassis | $[1.20, 0.15, 1.60]$ | $0.15\text{ kg}$ | Badan utama robot tempat semua part menempel. |
| `ESP32_DEVKIT` | ESP32 Microcontroller | $[0.28, 0.08, 0.55]$ | $0.02\text{ kg}$ | Otak pemrosesan dan penghasil sinyal $\text{PWM}$. |
| `BATTERY_2S` | LiPo Battery $7.4\text{ V}$ + BEC $5\text{ V}$ | $[0.35, 0.18, 0.70]$ | $0.08\text{ kg}$ | Sumber daya utama mikrokontroler dan servo. |
| `SERVO_MG90S` | Micro Servo MG90S | $[0.22, 0.28, 0.12]$ | $0.014\text{ kg}$ | Aktuator rotasi dengan rentang sudut $\theta \in [0^\circ, 180^\circ]$. |
| `LEG_COXA` | Coxa Bracket (Sendi Bahu) | $[0.30, 0.15, 0.20]$ | $0.01\text{ kg}$ | Penghubung antara servo bahu (*Hip*) dan servo lutut (*Knee*). |
| `LEG_TIBIA` | Tibia Foot (Kaki Laba-Laba) | $[0.65, 0.12, 0.12]$ | $0.02\text{ kg}$ | Ujung kaki yang menyentuh tanah (memiliki $\mu = 0.9$). |

---

## 1A. Chassis Grounding & Assembly Support Jig Constants (`socketRegistry.ts`)
- **Formula Grounding Dasar (`CHASSIS_HALF_HEIGHT`):**
  - `CHASSIS_DIMENSIONS` $= [1.20, 0.15, 1.60]$
  - `CHASSIS_HALF_HEIGHT` $= \frac{0.15}{2} = 0.075$
  - `CHASSIS_COLLIDER_HALF_EXTENTS` $= [0.60, 0.075, 0.80]$ (sinkron antara `<boxGeometry>` dan Rapier `<CuboidCollider>`).
  - Ketika **tidak ada kaki (`LEG_TIBIA`) yang terpasang**, titik pusat sasis berada pada $y = \text{CHASSIS\_HALF\_HEIGHT} = 0.075$ sehingga bagian bawah sasis menempel rata di lantai ($y = 0$) tanpa celah melayang.
- **Tinggi Perakitan Kerja & Assembly Stand (`CHASSIS_ASSEMBLY_WORKING_Y`):**
  - `CHASSIS_ASSEMBLY_WORKING_Y` $= 0.50$ (tinggi kerja standar saat minimal satu `LEG_TIBIA` terpasang agar ujung kaki tidak menembus lantai $y = 0$).
  - Selama `simulationStatus === 'idle'` dan sasis berada di atas lantai ($y > \text{CHASSIS\_HALF\_HEIGHT}$), `AssemblyStand` merender jig penopang industri semi-transparan plus `<CuboidCollider>` tetap dari $y = 0$ hingga bagian bawah sasis ($y - \text{CHASSIS\_HALF\_HEIGHT} = 0.425$).
  - Saat `simulationStatus === 'playing'`, `AssemblyStand` disembunyikan dan *collider*-nya dinonaktifkan sepenuhnya sehingga robot berdiri di atas kaki-kakinya akibat gravitasi Rapier.

---

## 2. Hirarki Perakitan (Assembly Tree)
Robot laba-laba menggunakan konfigurasi **Quadruped $8\text{ DOF}$** (4 kaki, masing-masing 2 motor servo: *Hip/Yaw* dan *Knee/Pitch*):
- **FL:** Front-Left (Kiri Depan)
- **FR:** Front-Right (Kanan Depan)
- **BL:** Back-Left (Kiri Belakang)
- **BR:** Back-Right (Kanan Belakang)

```text
CHASSIS_BASE (Root RigidBody)
├── SOCKET_MCU        --> ESP32_DEVKIT
├── SOCKET_BAT        --> BATTERY_2S
├── SOCKET_HIP_FL     --> SERVO_MG90S (Hip FL, sumbu rotasi: Y)
│   └── SOCKET_HORN   --> LEG_COXA
│       └── SOCKET_KNEE --> SERVO_MG90S (Knee FL, sumbu rotasi: Z)
│           └── SOCKET_HORN --> LEG_TIBIA
├── SOCKET_HIP_FR     --> SERVO_MG90S (Hip FR, sumbu rotasi: Y)
│   └── ... (identik untuk ke-4 kaki)
├── SOCKET_HIP_BL     --> SERVO_MG90S (Hip BL, sumbu rotasi: Y)
└── SOCKET_HIP_BR     --> SERVO_MG90S (Hip BR, sumbu rotasi: Y)
```

---

## 3. Peta Koordinat Socket pada `CHASSIS_BASE`
Koordinat lokal $[x, y, z]$ dan orientasi Euler $[r_x, r_y, r_z]$ (dalam radian) relatif terhadap titik pusat $[0, 0, 0]$ dari `CHASSIS_BASE`:

| Socket ID | Target Part Type | Posisi Lokal $[x, y, z]$ | Rotasi Lokal $[r_x, r_y, r_z]$ | Sumbu Sendi |
| :--- | :--- | :--- | :--- | :--- |
| `SOCKET_MCU` | `ESP32_DEVKIT` | $[0.00, 0.12, 0.35]$ | $[0, 0, 0]$ | Statis (Fixed) |
| `SOCKET_BAT` | `BATTERY_2S` | $[0.00, 0.16, -0.35]$ | $[0, 0, 0]$ | Statis (Fixed) |
| `SOCKET_HIP_FL` | `SERVO_MG90S` | $[-0.55, 0.00, 0.65]$ | $[0, -\frac{\pi}{4}, 0]$ | Revolute $[0, 1, 0]$ |
| `SOCKET_HIP_FR` | `SERVO_MG90S` | $[0.55, 0.00, 0.65]$ | $[0, \frac{\pi}{4}, 0]$ | Revolute $[0, 1, 0]$ |
| `SOCKET_HIP_BL` | `SERVO_MG90S` | $[-0.55, 0.00, -0.65]$ | $[0, -\frac{3\pi}{4}, 0]$ | Revolute $[0, 1, 0]$ |
| `SOCKET_HIP_BR` | `SERVO_MG90S` | $[0.55, 0.00, -0.65]$ | $[0, \frac{3\pi}{4}, 0]$ | Revolute $[0, 1, 0]$ |

---

## 4. Peta Koordinat Sub-Socket pada Komponen Kaki
Setiap komponen yang dipasang memiliki *child socket* untuk komponen berikutnya:

1. **Pada `SERVO_MG90S`:**
   - Memiliki 1 titik keluar bernama `SOCKET_SERVO_HORN` di koordinat lokal $[0.00, 0.18, 0.00]$.
   - Menerima part bertipe `LEG_COXA` (jika servo berada di slot *Hip*) atau `LEG_TIBIA` (jika servo berada di slot *Knee*).
2. **Pada `LEG_COXA`:**
   - Memiliki 1 titik keluar bernama `SOCKET_COXA_DISTAL` di koordinat lokal $[0.25, 0.00, 0.00]$ dengan rotasi $[\frac{\pi}{2}, 0, 0]$ (memutar orientasi servo lutut agar berputar secara vertikal/naik-turun).
   - Menerima part bertipe `SERVO_MG90S`.
3. **Pada `LEG_TIBIA`:**
   - Ujung kontak lantai (*foot tip*) berada di koordinat lokal $[0.60, -0.15, 0.00]$. Berikan collider bola kecil (`<BallCollider args={[0.06]} friction={1.2} />`) pada ujung ini agar kaki memiliki traksi saat mendorong lantai.

---

## 5. Peta Koordinat Pin Elektronik (`WIRING_MODE`)

### A. Pin pada `ESP32_DEVKIT` (Relatif terhadap pusat `ESP32_DEVKIT`)
| Pin ID | Label | Fungsi | Posisi Lokal $[x, y, z]$ | Warna Indikator |
| :--- | :--- | :--- | :--- | :--- |
| `ESP_VIN` | `5V / VIN` | Power Input ($5\text{ V}$) | $[-0.12, 0.05, 0.24]$ | Merah (`#ef4444`) |
| `ESP_GND` | `GND` | Common Ground ($0\text{ V}$) | $[-0.12, 0.05, 0.18]$ | Hitam (`#1f2937`) |
| `ESP_D13` | `GPIO 13` | PWM Output (Default: Hip FL) | $[-0.12, 0.05, 0.10]$ | Kuning (`#eab308`) |
| `ESP_D12` | `GPIO 12` | PWM Output (Default: Knee FL) | $[-0.12, 0.05, 0.04]$ | Kuning (`#eab308`) |
| `ESP_D14` | `GPIO 14` | PWM Output (Default: Hip FR) | $[-0.12, 0.05, -0.02]$ | Kuning (`#eab308`) |
| `ESP_D27` | `GPIO 27` | PWM Output (Default: Knee FR) | $[-0.12, 0.05, -0.08]$ | Kuning (`#eab308`) |
| `ESP_D26` | `GPIO 26` | PWM Output (Default: Hip BL) | $[0.12, 0.05, 0.10]$ | Kuning (`#eab308`) |
| `ESP_D25` | `GPIO 25` | PWM Output (Default: Knee BL) | $[0.12, 0.05, 0.04]$ | Kuning (`#eab308`) |
| `ESP_D33` | `GPIO 33` | PWM Output (Default: Hip BR) | $[0.12, 0.05, -0.02]$ | Kuning (`#eab308`) |
| `ESP_D32` | `GPIO 32` | PWM Output (Default: Knee BR) | $[0.12, 0.05, -0.08]$ | Kuning (`#eab308`) |

### B. Pin pada Setiap Instance `SERVO_MG90S`
Setiap motor servo yang ditempatkan di *scene* memiliki 3 pin input di sisi kabelnya:
- `SERVO_PWM` di $[0.00, -0.10, -0.08]$ (Oranye `#f97316`) $\rightarrow$ Harus terhubung ke salah satu pin `GPIO` ESP32.
- `SERVO_VCC` di $[0.00, -0.10, -0.06]$ (Merah `#ef4444`) $\rightarrow$ Harus terhubung ke jalur $5\text{ V}$ (`BAT_5V` atau *Power Rail*).
- `SERVO_GND` di $[0.00, -0.10, -0.04]$ (Cokelat/Hitam `#1f2937`) $\rightarrow$ Harus terhubung ke jalur `GND`.