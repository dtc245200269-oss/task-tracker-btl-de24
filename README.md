# HỆ THỐNG QUẢN LÝ CÔNG VIỆC (TASK TRACKER) - BÀI TẬP LỚN ĐỀ 24

> **Môn học:** Triển khai và Quản trị Hệ thống Phần mềm  
> **Chủ đề Đề 24:** Hệ thống Quản lý Công việc / Task Tracker  
> **Công nghệ:** Node.js (Express), PostgreSQL 16, pgAdmin 4, Nginx Reverse Proxy (HTTPS Tự Ký), Prometheus, Grafana, Loki, Promtail, cAdvisor, postgres-exporter, Docker & Docker Compose.

---

## 📌 MỤC LỤC
1. [Giới Thiệu Tổng Quan](#1-giới-thiệu-tổng-quan)
2. [Sơ Đồ Kiến Trúc Hệ Thống & Mạng (Network Isolation)](#2-sơ-đồ-kiến-trúc-hệ-thống--mạng-network-isolation)
3. [Cấu Trúc Thư Mục Dự Án](#3-cấu-trúc-thư-mục-dự-án)
4. [Hướng Dẫn Quản Lý Git & 3 Commit Chuẩn Quy Định](#4-hướng-dẫn-quản-lý-git--3-commit-chuẩn-quy-định)
5. [Hướng Dẫn Triển Khai Trên Máy Ảo VMware Qua SSH](#5-hướng-dẫn-triển-khai-trên-máy-ảo-vmware-qua-ssh)
6. [Danh Sách Cổng & Địa Chỉ Truy Cập Dịch Vụ](#6-danh-sách-cổng--địa-chỉ-truy-cập-dịch-vụ)
7. [Hướng Dẫn Sử Dụng & Demo Đầy Đủ Các Thành Phần](#7-hướng-dẫn-sử-dụng--demo-đầy-đủ-các-thành-phần)
   - 7.1. Website Quản lý công việc (Kanban & List View)
   - 7.2. Quản trị Cơ sở dữ liệu với pgAdmin
   - 7.3. Giám sát Hệ thống với Prometheus & Grafana Dashboard
   - 7.4. Truy vấn Log tập trung với Grafana Loki & LogQL (3+ Queries)
   - 7.5. Minh chứng các biện pháp Bảo mật (Hardening)
8. [Khắc Phục Sự Cố Thường Gặp (Troubleshooting)](#8-khắc-phục-sự-cố-thường-gặp-troubleshooting)

---

## 1. Giới Thiệu Tổng Quan
Hệ thống **TaskTracker Pro** được xây dựng nhằm đáp ứng toàn diện các tiêu chí đánh giá của **Đề 24**:
- **Ứng dụng Web Task Tracker:** Cho phép người dùng quản lý công việc cá nhân và công việc nhóm. Tính năng bao gồm: tạo task, gán thành viên, thiết lập deadline, phân cấp độ ưu tiên (Low, Medium, High), cập nhật trạng thái (To Do, In Progress, Review, Done), bộ lọc tìm kiếm và bảng Kanban board kéo thả mượt mà.
- **Cơ sở dữ liệu:** PostgreSQL 16 lưu trữ toàn bộ dữ liệu, tự động khởi tạo bảng (`users`, `teams`, `tasks`, `team_members`), chỉ mục (index) và nạp dữ liệu mẫu ban đầu qua `database/init.sql`. Tích hợp công cụ trực quan hóa **pgAdmin 4**.
- **Web Server & Reverse Proxy:** Nginx đón đầu toàn bộ traffic tại port 80 (HTTP) và port 443 (HTTPS với chứng chỉ SSL tự ký), cấu hình bảo mật Security Headers (HSTS, CSP, X-Frame-Options...) và cơ chế Rate Limiting chống tấn công DoS.
- **Hệ thống Giám sát (Monitoring):** Prometheus định kỳ thu thập metrics từ Web App (`/metrics`), cơ sở dữ liệu PostgreSQL (`postgres-exporter`) và tài nguyên phần cứng Container (`cAdvisor`). Grafana tự động import sẵn Dashboard trực quan.
- **Hệ thống Log tập trung:** Promtail đọc logs từ file và container, chuyển tiếp về Grafana Loki. Dễ dàng truy vấn, phân tích và thống kê lỗi bằng ngôn ngữ LogQL.
- **Tăng cường Bảo mật (Hardening):** Chạy container non-root (`USER node`), phân chia mạng cách ly (Network Isolation), mật khẩu phức tạp, kiểm soát quyền truy cập database, script hardening máy chủ (UFW Firewall, Fail2ban, SSH hardening).

---

## 2. Sơ Đồ Kiến Trúc Hệ Thống & Mạng (Network Isolation)

```
                     Internet / Client Browser
                                 │
                     ┌───────────┴───────────┐
                     │   Port 80     Port 443 │
                     │   (HTTP)      (HTTPS)  │
                     └───────────┬───────────┘
                                 │
                     ┌───────────▼───────────┐
                     │  Nginx Reverse Proxy  │
                     │  (Rate Limit/Headers) │
                     └─────┬───────────┬─────┘
                           │           │
         ┌─────────────────┘           └─────────────────┐
         │ (frontend-net)                                │ (frontend-net)
         ▼                                               ▼
┌──────────────────┐                            ┌──────────────────┐
│  TaskTracker App │                            │  pgAdmin 4 (Web) │
│  (Node.js:3000)  │                            │  (Port 80)       │
└────────┬─────────┘                            └────────┬─────────┘
         │ (backend-net)                                 │ (backend-net)
         ▼                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│              PostgreSQL 16 Database (Port 5432)                  │
│       [KHÔNG EXPOSE RA NGOÀI HOST - CHỈ NỘI BỘ BACKEND-NET]      │
└────────────────────────────────┬─────────────────────────────────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         │ (backend-net)                                 │ (monitoring-net)
         ▼                                               ▼
┌──────────────────┐                            ┌──────────────────┐
│ postgres-exporter│                            │ cAdvisor (Host)  │
│ (Port 9187)      │                            │ (Port 8080)      │
└────────┬─────────┘                            └────────┬─────────┘
         │                                               │
         └───────────────────────┬───────────────────────┘
                                 │ (monitoring-net)
                                 ▼
                     ┌───────────────────────┐
                     │ Prometheus (Port 9090)│
                     └───────────┬───────────┘
                                 │
┌──────────────────┐             │             ┌──────────────────┐
│   App / Nginx    │             │             │   Grafana 10     │
│    Log Files     ├─────────┐   │   ┌─────────┤   (Port 3000)    │
└──────────────────┘         │   │   │         └──────────────────┘
                             ▼   ▼   ▼
                     ┌───────────────────────┐
                     │ Promtail ──► Loki     │
                     │ (Port 9080)  (Port 3100)│
                     └───────────────────────┘
```

---

## 3. Cấu Trúc Thư Mục Dự Án

```
duanthi/
├── app/                                # Mã nguồn Ứng dụng Web Task Tracker
│   ├── public/                         # Giao diện Frontend (SPA hiện đại)
│   │   ├── index.html                  # Trang chủ (Kanban Board, List, Modal)
│   │   ├── css/
│   │   │   └── style.css               # Design System hiện đại, Dark theme, Glassmorphism
│   │   └── js/
│   │       └── app.js                  # Logic gọi API, Drag-drop, Filter, Toasts
│   ├── src/                            # Backend API (Node.js Express)
│   │   ├── server.js                   # Khởi tạo Express, Helmet, CORS, Rate Limit
│   │   ├── db.js                       # Connection Pool kết nối PostgreSQL
│   │   ├── metrics.js                  # Prometheus prom-client metrics & middleware
│   │   ├── logger.js                   # Winston JSON logger ghi ra file & console
│   │   └── routes/
│   │       ├── tasks.js                # API CRUD công việc cá nhân / nhóm
│   │       ├── teams.js                # API quản lý nhóm & phân quyền thành viên
│   │       └── stats.js                # API tổng hợp số liệu thống kê
│   ├── Dockerfile                      # Build container: non-root (node), dumb-init
│   ├── .dockerignore                   # Bỏ qua node_modules, logs khi build
│   └── package.json                    # Khai báo thư viện & dependencies
├── database/
│   └── init.sql                        # Script tạo bảng, chỉ mục và dữ liệu mẫu
├── nginx/
│   ├── default.conf                    # Reverse Proxy, SSL, Security Headers, Rate Limit
│   ├── generate-ssl.sh                 # Script bash tạo chứng chỉ SSL tự ký
│   └── ssl/                            # Thư mục chứa cert & private key (nginx.crt, nginx.key)
├── monitoring/
│   ├── prometheus/
│   │   └── prometheus.yml              # Cấu hình scrape App, DB, Container
│   ├── grafana/
│   │   ├── provisioning/
│   │   │   ├── datasources/
│   │   │   │   └── datasources.yml     # Auto nạp Prometheus & Loki
│   │   │   └── dashboards/
│   │   │       └── dashboards.yml      # Auto nạp Dashboard Provider
│   │   └── dashboards/
│   │       └── json/
│   │           └── tasktracker-dashboard.json # Dashboard JSON trực quan hoàn chỉnh
│   ├── loki/
│   │   └── loki-config.yml             # Cấu hình lưu trữ và phân đoạn log của Loki
│   └── promtail/
│       └── promtail-config.yml         # Thu thập logs từ Nginx & App vào Loki
├── security/
│   └── hardening.sh                    # Script tự động Hardening máy chủ Ubuntu (UFW, SSH, Fail2ban)
├── .env.example                        # File mẫu định nghĩa các biến môi trường
├── .env                                # Biến môi trường thực tế (Mật khẩu mạnh)
├── .gitignore                          # Bỏ qua các file tạm, bảo mật
├── docker-compose.yml                  # Khởi chạy 10 services với 1 câu lệnh duy nhất
└── README.md                           # Hướng dẫn chi tiết triển khai và báo cáo
```

---

## 4. Hướng Dẫn Quản Lý Git & 3 Commit Chuẩn Quy Định

Theo yêu cầu của đề tài:
> **Tiêu chí 1 (1.5 điểm):** Quản lý toàn bộ mã nguồn trên GitHub, **tạo tài khoản/đặt tên theo mã số SV**, repository đầy đủ, **đủ 03 commit** và nội dung có ý nghĩa rõ ràng.

### Bước 4.1: Tạo tài khoản GitHub & Đặt tên Repository theo MSSV
1. Đăng ký/đăng nhập tài khoản GitHub với username chứa MSSV (ví dụ: `sv20210001` hoặc `mssv-20210001`).
2. Nhấn **New Repository**, đặt tên: `task-tracker-btl-de24` (để chế độ Public hoặc Private tùy yêu cầu GV).

### Bước 4.2: Thực hiện đúng 03 Commit có ý nghĩa theo quy định

Mở terminal tại thư mục gốc dự án và chạy lần lượt các bước sau:

```bash
# Khởi tạo git repository
git init
git branch -M main

# -------------------------------------------------------------
# COMMIT 1: Triển khai Ứng dụng Web, PostgreSQL, pgAdmin và Nginx Reverse Proxy
# -------------------------------------------------------------
git add app/ database/ nginx/ .env.example .gitignore
git commit -m "feat(core): implement Task Tracker web app, PostgreSQL, pgAdmin and Nginx reverse proxy with SSL"

# -------------------------------------------------------------
# COMMIT 2: Tích hợp hệ thống giám sát Prometheus và Grafana
# -------------------------------------------------------------
git add monitoring/prometheus/ monitoring/grafana/
git commit -m "feat(monitoring): integrate Prometheus metrics scrapers and Grafana dashboard for container, web, and DB"

# -------------------------------------------------------------
# COMMIT 3: Tích hợp Log tập trung Loki + Promtail và cấu hình Hardening bảo mật
# -------------------------------------------------------------
git add monitoring/loki/ monitoring/promtail/ security/ docker-compose.yml .env README.md
git commit -m "feat(observability&security): deploy centralized Loki logging, Promtail, and system hardening configurations"
```

### Bước 4.3: Đẩy mã nguồn lên GitHub
```bash
# Thêm Remote (thay thế URL bằng repo của bạn)
git remote add origin https://github.com/dtc245200269-oss/task-tracker-btl-de24.git

# Đẩy toàn bộ nhánh main và 03 commit lên GitHub
git push -u origin main
```

Kiểm tra lịch sử commit bằng lệnh:
```bash
git log --oneline
```
Kết quả hiển thị chính xác 3 commit đầy đủ và đúng trình tự!

---

## 5. Hướng Dẫn Triển Khai Trên Máy Ảo VMware Qua SSH

### Bước 5.1: Chuẩn bị máy ảo VMware (Ubuntu 22.04 / Debian 12)
1. Bật máy ảo trên VMware Workstation / Player.
2. Kiểm tra địa chỉ IP của máy ảo:
   ```bash
   ip a
   # Hoặc: hostname -I
   ```
   *(Giả sử IP máy ảo là `192.168.1.100`)*.
3. Cài đặt Docker và Docker Compose trên máy ảo nếu chưa có:
   ```bash
   sudo apt-get update
   sudo apt-get install -y ca-certificates curl gnupg git
   # Cài Docker Engine & Docker Compose plugin
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   newgrp docker
   ```

### Bước 5.2: Kết nối SSH từ máy Host (Windows/Mac) vào máy ảo
Mở PowerShell hoặc Terminal trên máy thật:
```bash
ssh <tên_user_vm>@192.168.1.100
# Ví dụ: ssh ubuntu@192.168.1.100
```

### Bước 5.3: Clone mã nguồn từ GitHub về máy ảo
```bash
cd ~
git clone https://github.com/dtc245200269-oss/task-tracker-btl-de24.git
cd task-tracker-btl-de24
```

### Bước 5.4: Khởi tạo biến môi trường & Chứng chỉ SSL
```bash
# 1. Tạo file .env từ file mẫu
cp .env.example .env

# 2. Cấp quyền thực thi và tạo chứng chỉ SSL tự ký
chmod +x nginx/generate-ssl.sh
bash nginx/generate-ssl.sh
```

### Bước 5.5: Khởi chạy toàn bộ hệ thống bằng Docker Compose
Chạy 1 câu lệnh duy nhất:
```bash
docker compose up -d --build
```

Kiểm tra trạng thái các container đang chạy:
```bash
docker compose ps
```
Tất cả 10 containers đều phải ở trạng thái `running` (hoặc `healthy`).

---

## 6. Danh Sách Cổng & Địa Chỉ Truy Cập Dịch Vụ

*(Địa chỉ IP máy ảo VMware: `192.168.180.128`)*

| Dịch Vụ | Địa Chỉ Truy Cập (Qua Nginx) | Tài Khoản / Mật Khẩu Mặc Định | Mô Tả |
| :--- | :--- | :--- | :--- |
| **TaskTracker Web** | `http://192.168.180.128/` hoặc `https://192.168.180.128/` | *Truy cập trực tiếp* | Quản lý công việc Kanban, Deadline, Cá nhân/Nhóm |
| **pgAdmin 4** | `http://192.168.180.128/pgadmin/` | Email: `admin@tasktracker.com`<br>Pass: `AdminSecure2026!` | Quản trị giao diện CSDL PostgreSQL |
| **Grafana** | `http://192.168.180.128/grafana/` | User: `admin`<br>Pass: `GrafanaSecure2026!` | Dashboard giám sát Container, Web & DB, xem Logs |
| **Prometheus** | `http://192.168.180.128/prometheus/` | *Truy cập trực tiếp* | Máy chủ giám sát Metrics & PromQL Query |
| **App Metrics** | `http://192.168.180.128/metrics` | *Truy cập trực tiếp* | Prometheus raw metrics từ Node.js prom-client |

---

## 7. Hướng Dẫn Sử Dụng & Demo Đầy Đủ Các Thành Phần

### 7.1. Website Quản lý công việc (Task Tracker Web)
- **Giao diện Kanban Board:** 4 cột trực quan tương ứng với 4 trạng thái: *Cần Làm (To Do)*, *Đang Làm (In Progress)*, *Đang Đánh Giá (Review)*, *Đã Hoàn Thành (Done)*.
- **Thao tác nhanh:**
  - Nhấn nút **"+ Tạo Công Việc"** ở góc phải thanh điều hướng. Điền tiêu đề, mô tả, chọn loại (Cá nhân hoặc Nhóm), độ ưu tiên (Cao, Trung bình, Thấp), deadline.
  - Trên mỗi thẻ công việc (Card), click các nút chuyển trạng thái nhanh (`Bắt đầu`, `Review`, `Xong`) để di chuyển task giữa các cột.
  - Nút chuyển chế độ xem: Nhấn biểu tượng danh sách để chuyển từ dạng Kanban sang **Dạng Bảng (List Table View)**.
  - Bộ lọc: Lọc nhanh theo phạm vi (Tất Cả / Cá Nhân / Nhóm), lọc theo Độ ưu tiên và ô tìm kiếm tức thì (live search).

### 7.2. Quản trị Cơ sở dữ liệu với pgAdmin
1. Mở trình duyệt: `http://192.168.1.100/pgadmin/`
2. Đăng nhập với tài khoản:
   - Email: `admin@tasktracker.com`
   - Password: `AdminSecure2026!`
3. Kết nối đến cơ sở dữ liệu PostgreSQL:
   - Chuột phải vào **Servers** -> Chọn **Register** -> **Server...**
   - Tab **General**: Đặt tên gợi nhớ `TaskTracker DB`.
   - Tab **Connection**:
     - Host name/address: `postgres`
     - Port: `5432`
     - Maintenance database: `tasktracker_db`
     - Username: `taskuser`
     - Password: `TaskSecurePass2026!`
   - Nhấn **Save**.
4. Truy cập cây thư mục: `Databases` -> `tasktracker_db` -> `Schemas` -> `public` -> `Tables`.
5. Bạn sẽ thấy các bảng đã tự động tạo: `users`, `teams`, `team_members`, `tasks`. Chuột phải vào bảng `tasks` -> chọn **View/Edit Data** -> **All Rows** để kiểm chứng dữ liệu mẫu đã được nạp tự động qua `init.sql`.

### 7.3. Giám sát Hệ thống với Prometheus & Grafana Dashboard
1. Mở Grafana: `http://192.168.1.100/grafana/`
2. Đăng nhập tài khoản: `admin` / `GrafanaSecure2026!`
3. Vào **Dashboards** -> Chọn thư mục **TaskTracker System** -> Mở dashboard **TaskTracker Hệ Thống Giám Sát Toàn Diện**.
4. Dashboard đã cấu hình sẵn 4 hàng chỉ số chuyên sâu:
   - **Hàng 1: Business Metrics:** Tổng số tasks, số task hoàn thành, số task đang làm, Uptime của Node.js.
   - **Hàng 2: Web Server Traffic:** Tần suất HTTP requests theo route & mã trạng thái HTTP (200, 404, 500), độ trễ phản hồi P95 Latency.
   - **Hàng 3: Resource & DB Usage:** Mức độ tiêu thụ CPU & RAM của từng Docker Container (thu thập từ cAdvisor), số lượng kết nối đang mở đến PostgreSQL (thu thập từ `postgres-exporter`).
   - **Hàng 4: Live Logs:** Luồng log trực tiếp thu thập từ Loki.

### 7.4. Truy vấn Log tập trung với Grafana Loki & LogQL (3+ Queries)
Để demo tính năng phân tích log tập trung:
1. Trong Grafana, nhấn menu bên trái chọn **Explore** (biểu tượng la bàn).
2. Ở góc trên cùng bên trái, chọn Data source là **Loki**.
3. Nhập và chạy lần lượt **3 câu truy vấn LogQL mẫu** sau:

#### Truy vấn 1: Xem toàn bộ log của ứng dụng Task Tracker
```logql
{job="tasktracker-app"}
```
*Ý nghĩa:* Thu thập toàn bộ log được ghi từ ứng dụng Express qua thư viện Winston.

#### Truy vấn 2: Lọc các log cảnh báo và lỗi (Warn & Error)
```logql
{job="tasktracker-app"} |= "error"
```
*Ý nghĩa:* Tìm kiếm nhanh các bản ghi chứa chuỗi "error", giúp quản trị viên phát hiện ngay ngoại lệ (exception) hoặc truy vấn DB thất bại.

#### Truy vấn 3: Phân tích log định dạng JSON và lọc theo phương thức HTTP
```logql
{job="tasktracker-app"} | json | method="POST"
```
*Ý nghĩa:* Parse log JSON tự động, chỉ lọc các hành động tạo mới dữ liệu (POST request) trong hệ thống.

#### Truy vấn 4: Thống kê tần suất phát sinh log lỗi theo thời gian (Log Rate)
```logql
sum(rate({job="tasktracker-app"} |= "error" [1m])) by (service)
```
*Ý nghĩa:* Vẽ biểu đồ thời gian thực số lượng lỗi xuất hiện trên mỗi phút để phát hiện bất thường hệ thống.

### 7.5. Minh chứng các biện pháp Bảo mật (Hardening)
1. **Container Non-root:** Kiểm tra container `tasktracker-app` không chạy dưới quyền root:
   ```bash
   docker exec tasktracker-app whoami
   # Kết quả trả về: node (UID 1000)
   ```
2. **Network Isolation (Cách ly mạng):**
   - Cơ sở dữ liệu PostgreSQL nằm trong `tasktracker-backend-net`, hoàn toàn không có port binding ra máy chủ host. Thử kiểm tra từ máy host:
     ```bash
     curl http://localhost:5432
     # Bị từ chối kết nối (Connection refused) - chứng minh DB được bảo vệ an toàn
     ```
3. **Security Headers Nginx:** Kiểm tra các HTTP Security Headers trả về từ Nginx:
   ```bash
   curl -I https://localhost -k
   ```
   *Kết quả xác nhận có đầy đủ:* `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `X-XSS-Protection`.
4. **Giới hạn tài nguyên Container:** Trong `docker-compose.yml`, tất cả các dịch vụ đều được gán `resources.limits` về CPU và RAM, ngăn ngừa tình trạng cạn kiệt tài nguyên máy chủ.
5. **Script Hardening máy ảo VMware:**
   ```bash
   sudo bash security/hardening.sh
   # Tự động kích hoạt UFW Firewall (chỉ mở cổng 22, 80, 443), cài đặt Fail2ban chống Brute-force SSH.
   ```

---

## 8. Khắc Phục Sự Cố Thường Gặp (Troubleshooting)

- **Lỗi cổng 80 hoặc 443 đã bị chiếm dụng trên máy ảo:**
  ```bash
  sudo systemctl stop apache2 2>/dev/null || true
  sudo systemctl stop nginx 2>/dev/null || true
  docker compose restart nginx
  ```
- **Xem logs của một dịch vụ cụ thể:**
  ```bash
  docker compose logs -f app
  docker compose logs -f postgres
  docker compose logs -f nginx
  ```
- **Khởi động lại toàn bộ hệ thống từ đầu:**
  ```bash
  docker compose down -v
  docker compose up -d --build
  ```
