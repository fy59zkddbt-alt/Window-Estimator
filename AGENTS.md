# Window Estimator: правила проекта

Продукт: замер → расчёт → смета → PDF. Это не CRM.
Текущая реализация: только одностворчатое окно и один локальный демо-расчёт.

## Архитектура и ответственность

- `src/domain/measurements`: модели и инварианты замеров, без I/O.
- `src/domain/geometry`: размеры в мм → totalArea/activeArea в м²; без цен.
- `src/domain/pricing`: единственное место формулы, надбавок и округления денег.
- `src/domain/configuration`: контракты профилей/фурнитуры и явно демонстрационные тарифы.
- `src/domain/works`: только контракт дополнительных работ, пока без расчёта.
- `src/domain/calculation.ts`: результат с замером и снимком тарифов.
- `src/application/estimate`: координация валидации, geometry, pricing; интерфейс репозитория.
- `src/application/documents`: резерв для модели документа; без PDF в текущем этапе.
- `src/infrastructure/storage`: Dexie/IndexedDB, схема и реализация репозитория.
- `src/ui`: ввод, отображение, обработка ошибок; вызывает application.
- `src/main.tsx`: composition root, связывает UI и реализацию репозитория.

## Зависимости

`UI → application → domain`; `infrastructure → application ports + domain types`.
Domain может импортировать только domain; нельзя React, Dexie, DOM, fetch, storage.
Application не импортирует UI/infrastructure и не выполняет браузерный I/O.
UI не импортирует infrastructure или функции geometry/pricing; типы domain разрешены.
Geometry не зависит от pricing. Pricing получает площади, не вычисляет геометрию.
Нельзя копировать формулу в UI, документы, storage или application.
Связывание конкретных адаптеров разрешено только в composition root.

## Business invariants

- Только `Window | Balcony | WindowFinish` являются видами замера.
- `pvc | aluminium` — material, а не виды замеров.
- Один Window пока содержит одну GlazingPlane с одной Section; размеры находятся только в Section.
- room/name обязательны. Размеры — конечные числа > 0 в мм. Дробные мм разрешены.
- fixed не имеет hingeSide; turn/tilt_turn требуют left/right и выбранную фурнитуру.
- Активная площадь одностворчатого окна равна общей для turn/tilt_turn, иначе нулю.
- Профиль и выбранная фурнитура должны существовать и совпадать с material.
- Lamination: none/one_side/two_sides. Цвет начисляется на общую площадь.
- Тарифы и проценты конечны и >= 0; проценты не ограничены 100, нулевой тариф допустим.
- Activity и color складываются с базой; productMarkup применяется ко всей сумме.
- Фурнитура пока не создаёт отдельную надбавку.
- Площади и промежуточные суммы не округляются. Итог — целые копейки RUB (totalMinor).
- Числовое переполнение и выход за безопасный целочисленный диапазон запрещены.
- Сохранённый Calculation содержит независимый снимок configuration и schemaVersion.
- Изменение формы сбрасывает результат, чтобы нельзя было сохранить устаревший расчёт.
- IndexedDB локальна; серверное хранение, backend/auth/payments/subscriptions отсутствуют.
- Balcony, WindowFinish, дополнительные работы и PDF не имеют исполняемых сценариев.

## Проверки

Node.js >= 22.12; пакетный менеджер pnpm, lockfile обязателен.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run typecheck
pnpm run build
pnpm run dev
```

Unit tests: `pnpm test`; интерактивно: `pnpm run test:watch`.
Для изменений domain/pricing обязательны тесты бизнес-поведения, включая отрицательные случаи.
`tests/architecture.test.ts` проверяет границы импортов.
Не добавлять backend, CRM, auth, платежи или дополнительные пользовательские сценарии без явного запроса.
