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
*   **Auto-sorting keys:** Bổ sung tùy chọn tự động sắp xếp các key dịch thuật theo thứ tự bảng chữ cái (A-Z) hoặc theo thứ tự xuất hiện trong code khi thực hiện ghi đè hoặc cắt tỉa file JSON/YAML. *(Đã hoàn thành)*
*   **Interactive Pruning CLI:** Hỗ trợ chế độ CLI tương tác (Interactive mode) cho phép người dùng chọn cụ thể key dịch thuật muốn xoá qua giao diện TUI Picker trực quan. *(Đã hoàn thành)*
*   **Cải tiến cảnh báo Key động:** Phân loại cảnh báo thông minh hơn để phân biệt giữa key động hoàn toàn và key nối chuỗi có cấu trúc. *(Đã hoàn thành)*
*   **Hardcoded string detection (Phát hiện chuỗi text cứng):** Bổ sung tính năng tự động quét các đoạn văn bản thuần (text nodes) chưa qua dịch thuật nằm giữa các thẻ HTML/JSX/Vue/Svelte/Astro (ví dụ: `<div>Xin chào</div>`) và đưa ra cảnh báo để lập trình viên bọc chúng vào hàm dịch `t()`. *(Phase 4)*

### 📍 Giai đoạn 2: Tối ưu hóa cấu trúc & Khả năng tích hợp (Structure & Integration)
*   **Đọc và ghi an toàn tệp JS/TS:** Hỗ trợ đọc/ghi trực tiếp và an toàn trên các file locale dạng JavaScript/TypeScript (module ESM/CommonJS như `.ts`, `.js`, `.mjs`) sử dụng AST-based parser mà không làm hỏng định dạng file code hiện có.
*   **Tích hợp CI/CD nâng cao:** Hỗ trợ xuất kết quả kiểm tra ra định dạng cấu trúc chuẩn (JSON, JUnit XML) để tích hợp sâu vào các hệ thống CI/CD (GitHub Actions, GitLab CI), hiển thị PR annotations trực quan.

### 📍 Giai đoạn 3: Tương thích hệ sinh thái IDE (IDE Compatibility)
*   **Hỗ trợ cấu hình tích hợp IDE:** Thay vì xây dựng Extension riêng gây trùng lặp tính năng, dự án sẽ cung cấp các tệp cấu hình mẫu và tài liệu hướng dẫn giúp tích hợp và hoạt động mượt mà với các Extension phổ biến có sẵn trong cộng đồng (chẳng hạn như `i18n Ally` trên VS Code) để tối ưu hóa trải nghiệm autocomplete, hover preview và quản lý dịch thuật trực tiếp trong editor.

---

## 🤝 Tham gia đóng góp (Contributing)

Mọi đóng góp từ cộng đồng (Pull Requests, Bug Reports, Feature Requests) luôn được chào đón. Vui lòng tham khảo các tiêu chuẩn viết code sạch (clean code), quy trình kiểm thử trước khi tạo PR để giữ cho dự án luôn ở trạng thái tốt nhất.
