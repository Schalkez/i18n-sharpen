# i18n-sharpen Roadmap & Vision 🗺️

Tài liệu này đóng vai trò là kim chỉ nan phát triển và định hướng tương lai cho dự án open-source `i18n-sharpen`.

---

## 👁️ Tầm nhìn dự án (Project Vision)

> **"Giữ cho các tệp ngôn ngữ luôn sắc bén, gọn gàng và đồng bộ một cách dễ dàng nhất."**

`i18n-sharpen` hướng tới trở thành công cụ CLI chuẩn hóa tối ưu cho quy trình CI/CD và môi trường phát triển của dự án đa ngôn ngữ, tập trung vào **3 trụ cột cốt lõi**:
1. **Độc lập Framework (Framework-Agnostic):** Không giới hạn ở một framework hay thư viện cụ thể. Hỗ trợ tốt nhất cho mọi cú pháp code qua Regex Engine thông minh.
2. **Hiệu năng & Tối giản (Performant & Lightweight):** Cài đặt nhanh chóng, chạy trong tích tắc (< 100ms) trên local và CI/CD, không sinh ra overhead lúc runtime.
3. **An toàn & Minh bạch (Type-Safe & Defensive):** Bảo vệ tối đa dữ liệu dịch thuật, đưa ra cảnh báo sớm cho lập trình viên trước các thay đổi có nguy cơ gây mất mát dữ liệu (prune nhầm).

---

## 🛠️ Nguyên tắc phát triển (Development Principles)

Khi tiếp tục bảo trì và bổ sung các tính năng hoặc tối ưu hóa dự án, các nguyên tắc sau cần được tuân thủ nghiêm ngặt:

*   **Không thêm Dependencies bừa bãi:** Trọng lượng cài đặt của công cụ CLI cần được kiểm soát tốt. Ưu tiên sử dụng code thuần hoặc các gói phụ thuộc siêu nhẹ, chất lượng cao, không có lỗ hổng bảo mật.
*   **Bảo vệ dữ liệu dịch thuật làm ưu tiên hàng đầu:** Lệnh `prune` mặc định luôn chạy ở chế độ **Dry-run (Xem trước)** để tránh việc ghi đè trực tiếp lên đĩa khi chưa có sự xác nhận của người dùng.
*   **Property-Based Testing cho Core Logic:** Các module lõi như `locale-io`, `scanner`, `regex` phải được kiểm thử kỹ lưỡng qua các kỹ thuật test cao cấp (như `fast-check`) để đảm bảo không bị crash khi quét các tệp mã nguồn phức tạp ngoài thực tế.

---

## 🚀 Lộ trình phát triển tương lai (Roadmap)

### 📍 Giai đoạn 1: Hoàn thiện Trải nghiệm Lập trình viên (Developer Experience)
*   **Auto-sorting keys:** Bổ sung tùy chọn tự động sắp xếp các key dịch thuật theo thứ tự bảng chữ cái (A-Z) hoặc theo thứ tự xuất hiện trong code khi thực hiện ghi đè hoặc cắt tỉa file JSON/YAML.
*   **Interactive Pruning CLI:** Hỗ trợ chế độ CLI tương tác (Interactive mode) cho phép người dùng dùng phím lên/xuống và Space để chọn cụ thể key nào muốn giữ hoặc xóa, thay vì chỉ xóa toàn bộ hoặc dry-run.
*   **Cải tiến cảnh báo Key động:** Phân loại cảnh báo thông minh hơn để phân biệt giữa key động hoàn toàn (không thể đoán trước) và key nối chuỗi có cấu trúc (ví dụ: `t("error." + code)`).

### 📍 Giai đoạn 2: Mở rộng Hỗ trợ Hệ sinh thái
*   **Hỗ trợ tệp cấu hình dạng TypeScript/JavaScript:** Quét và cập nhật trực tiếp trên các file dịch được xuất ra dạng module ESM/CommonJS (`locales/en.ts`, `locales/vi.js`) bên cạnh JSON/YAML.
*   **Tăng cường khả năng tích hợp CI/CD:** Hỗ trợ xuất kết quả validation ra định dạng JSON/JUnit XML tiêu chuẩn để các hệ thống CI/CD (GitHub Actions, GitLab CI, Jenkins) có thể vẽ biểu đồ chất lượng hoặc hiển thị lỗi trực tiếp trên giao diện Pull Request.

### 📍 Giai đoạn 3: Tự động hóa thông minh (AI & Auto-Translation)
*   **Auto-Translation Integration:** Tích hợp với các dịch vụ dịch thuật phổ biến (Google Translate, DeepL) hoặc gọi API mô hình ngôn ngữ lớn (LLMs như GPT, Gemini, Claude) thông qua cấu hình API Key của người dùng để tự động sinh bản dịch nháp cho các key bị thiếu trong quá trình validate.

### 📍 Giai đoạn 4: Công cụ tích hợp sâu (Integrations)
*   **i18n-sharpen VS Code Extension:** Đóng gói nhân quét của dự án thành một Extension cho VS Code để highlight trực tiếp các key chưa được định nghĩa trong file locale ngay trên file code của lập trình viên khi đang gõ chữ.

---

## 🤝 Tham gia đóng góp (Contributing)

Mọi đóng góp từ cộng đồng (Pull Requests, Bug Reports, Feature Requests) luôn được chào đón. Vui lòng tham khảo các tiêu chuẩn viết code sạch (clean code), quy trình kiểm thử trước khi tạo PR để giữ cho dự án luôn ở trạng thái tốt nhất.
