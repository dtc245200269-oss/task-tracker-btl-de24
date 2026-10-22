-- ==========================================================
-- Cơ sở dữ liệu: TaskTracker PostgreSQL Schema & Mock Data
-- Đề 24: Hệ thống Quản lý Công việc Cá nhân và Nhóm
-- ==========================================================

-- Tạo bảng Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(20) DEFAULT 'member', -- 'admin', 'leader', 'member'
    avatar_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tạo bảng Teams (Nhóm làm việc)
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tạo bảng Team Members (Quan hệ nhiều - nhiều giữa Users và Teams)
CREATE TABLE IF NOT EXISTS team_members (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member', -- 'leader', 'developer', 'tester'
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_team_member UNIQUE (team_id, user_id)
);

-- Tạo bảng Tasks (Quản lý công việc cá nhân và nhóm)
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    deadline TIMESTAMP WITH TIME ZONE,
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    status VARCHAR(20) DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
    type VARCHAR(20) DEFAULT 'personal' CHECK (type IN ('personal', 'team')),
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trigger tự động cập nhật trường updated_at khi có UPDATE
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tasks_updated_at ON tasks;
CREATE TRIGGER trigger_tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Chỉ mục (Indexes) để tăng tốc độ truy vấn và filter
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_team_id ON tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);

-- ==========================================================
-- Dữ liệu mẫu khởi tạo (Mock Data)
-- ==========================================================

-- Chèn dữ liệu Users mẫu
INSERT INTO users (username, full_name, email, role, avatar_url) VALUES
('nguyenvan_a', 'Nguyễn Văn A (Nhóm Trưởng)', 'a.nguyen@student.edu.vn', 'leader', 'https://ui-avatars.com/api/?name=Nguyen+Van+A&background=6366f1&color=fff'),
('tranthi_b', 'Trần Thị B (DevOps)', 'b.tran@student.edu.vn', 'member', 'https://ui-avatars.com/api/?name=Tran+Thi+B&background=10b981&color=fff'),
('le_c', 'Lê Văn C (Backend Dev)', 'c.le@student.edu.vn', 'member', 'https://ui-avatars.com/api/?name=Le+Van+C&background=f59e0b&color=fff'),
('pham_d', 'Phạm Hoàng D (QA/Tester)', 'd.pham@student.edu.vn', 'member', 'https://ui-avatars.com/api/?name=Pham+Hoang+D&background=ec4899&color=fff')
ON CONFLICT (username) DO NOTHING;

-- Chèn dữ liệu Teams mẫu
INSERT INTO teams (id, name, description) VALUES
(1, 'Đội Dự Án Cloud & DevOps', 'Phụ trách cấu hình hạ tầng VMware, Docker, Nginx, Prometheus và Grafana'),
(2, 'Nhóm Phát Triển Ứng Dụng', 'Xây dựng mã nguồn Node.js Express, giao diện Kanban và API CRUD')
ON CONFLICT (id) DO NOTHING;

-- Chèn thành viên vào nhóm
INSERT INTO team_members (team_id, user_id, role) VALUES
(1, 1, 'leader'),
(1, 2, 'developer'),
(2, 3, 'developer'),
(2, 4, 'tester')
ON CONFLICT DO NOTHING;

-- Chèn danh sách công việc mẫu đa dạng (Cá nhân & Nhóm, đủ các trạng thái và deadline)
INSERT INTO tasks (title, description, deadline, priority, status, type, team_id, assigned_to) VALUES
('Khởi tạo Repository GitHub và cấu hình SSH', 'Tạo tài khoản GitHub theo MSSV, thêm SSH key để quản lý mã nguồn và thực hiện 3 commit theo quy định đề bài.', NOW() - INTERVAL '1 DAY', 'high', 'done', 'personal', NULL, 1),
('Thiết kế cơ sở dữ liệu PostgreSQL & kết nối pgAdmin', 'Viết init.sql tạo bảng users, teams, tasks, indexes và cấu hình service pgadmin trong docker-compose.', NOW() + INTERVAL '1 DAY', 'high', 'done', 'team', 1, 2),
('Cấu hình Nginx Reverse Proxy và HTTPS tự ký', 'Thiết lập Nginx định tuyến đến Web App, bật HTTPS SSL self-signed và cấu hình security headers (Commit 1).', NOW() + INTERVAL '2 DAYS', 'high', 'in_progress', 'team', 1, 2),
('Tích hợp hệ thống giám sát Prometheus và Grafana', 'Cấu hình scrape endpoint /metrics của App và postgres-exporter, import dashboard theo dõi CPU/RAM/HTTP (Commit 2).', NOW() + INTERVAL '3 DAYS', 'high', 'in_progress', 'team', 1, 1),
('Triển khai Loki + Promtail và viết 3 câu truy vấn LogQL', 'Thu thập log tập trung của Docker container và viết truy vấn LogQL lọc error, rate log trên Grafana Explore (Commit 3).', NOW() + INTERVAL '4 DAYS', 'medium', 'todo', 'team', 1, 3),
('Thực hiện các biện pháp Hardening bảo mật hệ thống', 'Chạy container non-root, cô lập mạng Docker networks, áp dụng UFW Firewall, Fail2ban và kiểm soát mật khẩu mạnh.', NOW() + INTERVAL '5 DAYS', 'high', 'todo', 'team', 1, 1),
('Nghiên cứu tài liệu công nghệ Docker Compose và Nginx', 'Đọc kỹ tài liệu chính thức về reverse proxy, rate-limiting và upstream load balancing.', NOW() - INTERVAL '2 DAYS', 'low', 'done', 'personal', NULL, 3),
('Hoàn thiện Báo cáo tổng hợp tối thiểu 10 trang BTL', 'Viết báo cáo đầy đủ bìa sinh viên, mục lục, mô tả kiến trúc, kết quả 6 bước, ảnh chụp minh chứng và đánh giá.', NOW() + INTERVAL '6 DAYS', 'medium', 'todo', 'personal', NULL, 1)
ON CONFLICT DO NOTHING;

-- Phân quyền cho user taskuser đọc metrics cho postgres-exporter (Hardening DB role)
GRANT pg_read_all_stats TO taskuser;
