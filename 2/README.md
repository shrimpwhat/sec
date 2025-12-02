# Hash Brute Force

Программа для брутфорса хэшей на Rust. Используется библиотека rayon для параллельных вычислений и оптимизации производительности.

[Отчет](https://github.com/user-attachments/assets/cb5e4a93-9f4d-4c52-986e-ab582bff1965)

## Поддерживаемые алгоритмы

-   MD5
-   SHA1
-   bcrypt
-   Argon2

## Запуск

-   Установить Rust https://rust-lang.org/tools/install/

-   Установить зависимости:

```bash
cargo build --release
```

-   Запустить:

```bash
cargo run --release
```
