# Реализованные меры безопасности

## 1. Предотвращение Path Traversal ✅

**Файл**: `src/utils/security.ts` - класс `PathValidator`

**Реализация**:

- Валидация всех путей через `validatePath()`
- Нормализация путей с помощью `path.normalize()` и `path.resolve()`
- Проверка, что итоговый путь находится внутри базовой директории
- Санитизация имен файлов - удаление `../`, `/`, `\` и других опасных символов

**Тест**: Попытка доступа к `../../../etc/passwd` блокируется

## 2. Защита от небезопасной десериализации ✅

**Файл**: `src/dataHandlers.ts`

**JSON (класс `SafeJSONHandler`)**:

- Использование стандартного `JSON.parse()` (не выполняет код)
- Проверка глубины вложенности объектов (макс. 10 уровней)
- Ограничение размера JSON (10 МБ)
- Валидация структуры данных

**XML (класс `SafeXMLHandler`)**:

- Отключение обработки внешних сущностей (`processEntities: false`)
- Проверка на наличие `<!DOCTYPE>` и `<!ENTITY>` (XXE атаки)
- Блокировка `SYSTEM` и `PUBLIC` ссылок
- Ограничение размера XML (10 МБ)

**Тест**: Безопасное чтение и запись JSON/XML файлов

## 3. Защита от ZIP-бомб ✅

**Файл**: `src/zipManager.ts` - класс `ZipManager`

**Реализация**:

- Анализ содержимого ZIP перед извлечением
- Проверка коэффициента сжатия каждого файла (макс. 100)
- Ограничение общего размера распакованных данных (500 МБ)
- Ограничение размера самого архива (50 МБ)
- Проверка размера несжатых файлов

**Тест**: Валидация коэффициента сжатия при извлечении

## 4. Предотвращение Race Conditions ✅

**Файл**: `src/utils/security.ts` - класс `FileLockManager`

**Реализация**:

- Система блокировок на уровне файлов
- Метод `withLock()` для атомарного выполнения операций
- Очередь операций для каждого файла
- Атомарная запись через временный файл + rename

**Использование**: Все операции с файлами в `FileManager` используют блокировки

## 5. SQL Injection Protection ✅

**Файл**: `src/database.ts` - класс `DatabaseManager`

**Реализация**:

- **100% использование prepared statements** для всех запросов
- Параметризованные запросы (`.prepare()` с плейсхолдерами `?`)
- Дополнительная санитизация ввода через `InputSanitizer`
- Транзакции для атомарных операций

**Примеры**:

```typescript
// ✅ Безопасно
this.db.prepare("SELECT * FROM Users WHERE username = ?").get(username);

// ❌ Уязвимо (НЕ используется)
this.db.exec(`SELECT * FROM Users WHERE username = '${username}'`);
```

**Тест**: Попытка SQL injection через username блокируется

## 6. Хранимые процедуры / Prepared Statements ✅

**Реализация**:

- Все методы в `DatabaseManager` используют `.prepare()`
- Кэширование prepared statements драйвером БД
- Транзакции через `transaction()` метод

**Методы**:

- `createUser()` - подготовленный INSERT
- `getUserByUsername()` - подготовленный SELECT
- `createFile()` - подготовленный INSERT
- `logOperation()` - подготовленный INSERT
- и все остальные...

## 7. Дополнительные меры безопасности ✅

### 7.1 Ограничение размеров файлов

**Файл**: `src/utils/security.ts` - класс `FileSizeValidator`

- Максимальный размер файла: 100 МБ
- Максимальный размер JSON: 10 МБ
- Максимальный размер XML: 10 МБ
- Максимальный размер ZIP: 50 МБ

### 7.2 Безопасное копирование и перемещение

**Файл**: `src/fileManager.ts`

- Атомарная запись через временный файл
- Блокировки при копировании
- Проверка размеров перед операциями

### 7.3 Контроль доступа

- Файлы привязаны к владельцу (owner_id)
- Аутентификация перед любыми операциями
- Валидация расширений файлов

## 8. Логирование действий пользователей ✅

**Файл**: `src/database.ts` - таблица `Operations`

**Реализация**:

- Все операции записываются в БД
- Информация: тип операции, пользователь, файл, время, детали
- Метод `logOperation()` вызывается после каждого действия

**Типы операций**:

- `create` - создание файла/пользователя
- `modify` - изменение файла
- `delete` - удаление файла
- `read` - чтение файла/директории

**Просмотр**: В CLI через меню "История операций"

### 4. Хеширование паролей (bcrypt)

**Защита**: Все пароли хешируются с использованием bcrypt с параметром cost factor = 10.

**Требования**:

- Длина пароля: 3-128 символов

**Реализация** (`src/auth.ts`):

- Валидация длины пароля
- Хеширование с солью при регистрации
- Безопасное сравнение хешей при логине

## Схема базы данных

```sql
-- Пользователи
CREATE TABLE Users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL  -- bcrypt hash
);

-- Файлы
CREATE TABLE Files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  size INTEGER,
  location TEXT,
  owner_id INTEGER NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES Users(id)
);

-- Журнал операций (аудит)
CREATE TABLE Operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  operation_type TEXT CHECK(operation_type IN ('create', 'modify', 'delete', 'read')),
  file_id INTEGER,
  user_id INTEGER NOT NULL,
  details TEXT,
  FOREIGN KEY (file_id) REFERENCES Files(id),
  FOREIGN KEY (user_id) REFERENCES Users(id)
);

-- Индексы для производительности
CREATE INDEX idx_files_owner ON Files(owner_id);
CREATE INDEX idx_operations_user ON Operations(user_id);
CREATE INDEX idx_operations_file ON Operations(file_id);
```

## Архитектура безопасности

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Interface                         │
│                    (index.ts)                            │
└───────────────────┬─────────────────────────────────────┘
                    │
        ┌───────────┴──────────┐
        │                      │
┌───────▼────────┐    ┌───────▼────────┐
│  AuthService   │    │  FileManager   │
│   (auth.ts)    │    │(fileManager.ts)│
└───────┬────────┘    └───────┬────────┘
        │                     │
        │         ┌───────────┴──────────┐
        │         │                      │
        │    ┌────▼─────┐      ┌────────▼────────┐
        │    │   Data   │      │   ZipManager    │
        │    │ Handlers │      │ (zipManager.ts) │
        │    └──────────┘      └─────────────────┘
        │
┌───────▼────────────────────────────────────────┐
│         DatabaseManager (database.ts)          │
│                                                 │
│  ✓ Prepared Statements                         │
│  ✓ Transactions                                │
│  ✓ Audit Logging                               │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│      Security Utilities (utils/security.ts)    │
│                                                 │
│  • PathValidator       - Path Traversal        │
│  • FileSizeValidator   - Size Limits           │
│  • FileLockManager     - Race Conditions       │
│  • InputSanitizer      - SQL Injection         │
└────────────────────────────────────────────────┘
```

## Тестирование

Запустите `bun test` для проверки всех мер безопасности.

### Статистика тестового покрытия:

```
✓ 47 тестов пройдено
✓ 72 проверки (expect)
✓ Время выполнения: ~700ms

Категории тестов:
- Authentication and User Management (6 тестов)
- File Operations (6 тестов)
- Path Traversal Protection (4 теста)
- File Size Validation (2 теста)
- JSON Handling (4 теста)
- XML Handling (5 тестов)
- SQL Injection Protection (3 теста)
- Database Operations and Logging (4 теста)
- Race Condition Prevention (2 теста)
- Security Configuration (6 тестов)
- System Information (1 тест)
- Audit Logging (4 теста)
```

Все тесты проходят успешно! ✅
