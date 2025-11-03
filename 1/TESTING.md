# Руководство по тестированию

## Запуск тестов

```bash
# Запустить все тесты
bun test

# Запустить с подробным выводом
bun test --verbose

# Запустить только конкретный файл
bun test test.test.ts

# Остановить при первой ошибке
bun test --bail

# Запустить в режиме watch (перезапуск при изменениях)
bun test --watch
```

## Структура тестов

Тесты находятся в файле `test.test.ts` и организованы по категориям:

### 1. Authentication and User Management (6 тестов)

- Регистрация пользователя с хешированием пароля
- Защита от дублирования username
- Валидация формата username
- Проверка требований к паролю
- Аутентификация с правильными данными
- Отклонение неверных данных

### 2. File Operations (6 тестов)

- Создание и чтение файлов
- Получение информации о файле
- Список файлов в директории
- Копирование файлов
- Удаление файлов
- Создание директорий

### 3. Path Traversal Protection (4 теста)

- Блокировка path traversal при чтении
- Санитизация имен файлов при записи
- Блокировка абсолютных путей
- Санитизация опасных символов

### 4. File Size Validation (2 теста)

- Отклонение файлов превышающих лимит
- Принятие файлов в пределах лимита

### 5. JSON Handling (4 теста)

- Безопасная сериализация и парсинг
- Отклонение слишком больших JSON
- Отклонение глубоко вложенных объектов
- Pretty printing

### 6. XML Handling (5 тестов)

- Безопасное создание и парсинг
- Блокировка XXE атак с DOCTYPE
- Блокировка XXE атак с ENTITY
- Блокировка внешних ссылок
- Отклонение больших XML

### 7. SQL Injection Protection (3 теста)

- Защита от SQL injection в username
- Использование prepared statements
- Обработка спецсимволов безопасно

### 8. Database Operations and Logging (4 теста)

- Логирование всех операций
- Использование транзакций
- Отслеживание владельца файла
- Запись деталей операций

### 9. Race Condition Prevention (2 теста)

- Безопасная конкурентная запись
- Безопасное чтение/запись одновременно

### 10. Security Configuration (6 тестов)

- Проверка всех настроек безопасности
- Валидация лимитов размеров
- Проверка разрешенных расширений

### 11. System Information (1 тест)

- Получение информации о дисковом пространстве

### 12. Audit Logging (4 теста)

- Логирование создания файлов
- Логирование изменений
- Логирование удалений
- Логирование чтения

## Результаты тестов

```
✓ 47 тестов пройдено
✓ 72 проверки (expect() calls)
✓ Время выполнения: ~600-700ms
✓ 0 ошибок
```

## Покрытие безопасности

Тесты проверяют все критические меры безопасности из задания:

- ✅ Path Traversal
- ✅ Insecure Deserialization (JSON/XML)
- ✅ ZIP Bomb Protection
- ✅ Race Conditions
- ✅ SQL Injection
- ✅ Password Hashing
- ✅ Audit Logging
- ✅ File Size Limits

## Добавление новых тестов

Для добавления нового теста используйте структуру:

```typescript
import { describe, test, expect } from "bun:test";

describe("Category Name", () => {
  test("should do something specific", async () => {
    // Arrange
    const input = "test data";

    // Act
    const result = await someFunction(input);

    // Assert
    expect(result).toBe("expected value");
  });
});
```

## Матчеры (Assertions)

Доступные проверки:

```typescript
expect(value).toBe(expected); // Строгое равенство
expect(value).toEqual(expected); // Глубокое равенство
expect(value).toBeDefined(); // Не undefined
expect(value).toBeUndefined(); // undefined
expect(value).toBeTruthy(); // Истинное значение
expect(value).toBeFalsy(); // Ложное значение
expect(value).toBeGreaterThan(n); // > n
expect(value).toBeGreaterThanOrEqual(n); // >= n
expect(value).toBeLessThan(n); // < n
expect(array).toContain(item); // Массив содержит
expect(fn).toThrow(); // Функция выбрасывает ошибку
expect(fn).toThrow("message"); // С определенным сообщением
```

## CI/CD Integration

Для интеграции в CI/CD pipeline:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun test
```

## Отладка тестов

```bash
# Запустить с выводом консоли
bun test --verbose

# Запустить конкретный тест
bun test -t "should register a new user"

# Запустить только failed тесты
bun test --only-failures
```

## Troubleshooting

**Проблема**: Тесты не находятся
**Решение**: Убедитесь что файл заканчивается на `.test.ts`, `.spec.ts` или `_test.ts`

**Проблема**: Timeout ошибки
**Решение**: Увеличьте timeout в `bunfig.toml`:

```toml
[test]
timeout = 10000
```

**Проблема**: Database locked
**Решение**: Убедитесь что предыдущий тест закрыл соединение с БД

## Best Practices

1. **Изоляция тестов**: Каждый тест должен быть независимым
2. **Cleanup**: Используйте `afterAll` для очистки ресурсов
3. **Уникальные данные**: Используйте `Date.now()` для уникальных имен
4. **Async/await**: Всегда используйте async для асинхронных операций
5. **Описательные названия**: Тест должен четко описывать что он проверяет
