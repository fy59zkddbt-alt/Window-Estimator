# Window Estimator: правила проекта

Продукт: замер → расчёт → смета → PDF. Это не CRM.
Текущая реализация: окно single/double/triple с необязательной верхней глухой фрамугой, balconyBlock внутри сценария «Окно», Balcony straight/L/U и самостоятельная отделка WindowFinish. Локально хранятся многозамерные Calculation: окна, балконы и отделка, дополнительные работы, данные клиента/объекта и базовая смета.

## Архитектура и ответственность

- `src/domain/measurements`: модели и инварианты замеров, без I/O.
- `src/domain/geometry`: размеры в мм → totalAreaM2/activeAreaM2, прямоугольники секций/фрамуги и линии обозначений открывания; без цен и SVG/DOM.
- `src/domain/pricing`: единственное место формул, надбавок и округления базовых цен замеров. Скидка всего Calculation рассчитывается и округляется отдельно в application/estimate.
- `src/domain/configuration`: контракты профилей/фурнитуры и явно демонстрационные тарифы.
- `src/domain/works`: контракт и валидация дополнительных работ; сложение стоимости принадлежит application.
- `src/domain/calculation.ts`: контейнер замеров, метаданных и снимков тарифов; без формул. `measurement-estimate.ts`: результат оценки одного замера.
- `src/application/estimate`: координация валидации, geometry, pricing; интерфейс репозитория.
- `src/application/documents`: резерв для модели документа; без PDF в текущем этапе.
- `src/infrastructure/storage`: Dexie/IndexedDB, схема, миграция v1 → v2 → v3 и реализация репозитория. Старый формат допустим только в адаптере миграции, не как вторая доменная модель.
- `src/ui`: ввод, отображение, обработка ошибок; вызывает application. SVG получает готовую geometry, не вычисляет координаты и площади.
- `src/main.tsx`: composition root, связывает UI и реализацию репозитория.

## Зависимости

`UI → application → domain`; `infrastructure → application ports + domain types`.
Domain может импортировать только domain; нельзя React, Dexie, DOM, fetch, storage.
Application не импортирует UI/infrastructure и не выполняет браузерный I/O.
UI не импортирует infrastructure или функции geometry/pricing; типы domain и демонстрационные данные configuration разрешены.
Редактор использует операции создания/распределения секций через application/estimate/window-editor.
Geometry не зависит от pricing. Pricing получает площади остекления или готовые количества отделки, не вычисляет геометрию. Нормализация режимов конфигурации находится в domain/configuration.
Нельзя копировать формулы базовых цен замеров в UI, документы, storage или application. Application складывает готовые цены и рассчитывает скидку заказа.
Связывание конкретных адаптеров разрешено только в composition root.

## Business invariants

- Только `Window | Balcony | WindowFinish` являются видами замера.
- `pvc | aluminium` — material, а не виды замеров.
- Один Window содержит одну GlazingPlane. windowType single/double/triple соответствует ровно 1/2/3 нижним секциям слева направо; их ID уникальны внутри окна.
- Для single/double/triple общие widthMm/heightMm принадлежат WindowMeasurement. Section содержит widthMm, открывание и, только для активных створок, hingeSide/hardwareId. Высота секции не дублируется в замере.
- room/name обязательны. Размеры — конечные числа > 0 в мм. Дробные мм разрешены.
- При создании/смене прямоугольного типа секции равны widthMm / count без округления, открывание fixed. Смена между single/double/triple явно сбрасывает прежние секции.
- После создания секции редактируются независимо. Изменение общей ширины НИКОГДА не корректирует секции. Кнопка «Распределить поровну» — явное действие; оно сохраняет открывания, петли и фурнитуру.
- Сумма ширин равна общей ширине. Допуск только для арифметики IEEE-754: 8 × Number.EPSILON × max(width, sum). Это не монтажный допуск; 0,000001 мм несоответствия у метрового окна уже ошибка. Размеры не нормализуются.
- fixed не имеет hingeSide/hardwareId; turn/tilt_turn требуют left/right и непустой hardwareId. Проверяется каждая секция.
- Необязательная transom имеет только heightMm и openingType=fixed; 0 < transom.heightMm < window.heightMm. Фрамуга занимает всю ширину сверху; петли/фурнитура запрещены. Для отключения удаляется объект, а не задаётся нулевая высота.
- Высота всех нижних секций = heightMm − transom.heightMm (или heightMm без фрамуги).
- Для single/double/triple totalAreaM2 = площадь внешнего прямоугольника. activeAreaM2 = сумма площадей только turn/tilt_turn нижних секций. Глухие секции и фрамуга неактивны.
- После валидации размеров превышение activeAreaM2 над totalAreaM2 в пределах 32 × Number.EPSILON × totalAreaM2 ограничивается общей площадью, большее превышение — ошибка. Это явная защита от погрешности суммирования площадей, не коррекция размеров.
- Геометрия использует мм, начало координат в левом верхнем углу, вид из помещения. Эскиз не вычитает толщину профиля. Вершина поворотного символа находится у петель; пунктирный треугольник откидывания направлен вершиной вверх. Отметки петель и отступы символические.
- SVG использует domain coordinates и viewBox с preserveAspectRatio="xMidYMid meet". Запрещены независимые scaleX/scaleY, равные CSS-колонки вместо реальных ширин и повторный расчёт geometry в React.
- Профиль и фурнитура каждой активной секции должны существовать и совпадать с material.
- Lamination: none/one_side/two_sides. Цвет начисляется на общую площадь.
- Тарифы и проценты конечны и >= 0; проценты не ограничены 100, нулевой тариф допустим.
- Activity и color складываются с базой; productMarkup применяется ко всей сумме.
- Фурнитура пока не создаёт отдельную надбавку.
- Площади и промежуточные суммы не округляются. Итог — целые копейки RUB (totalMinor).
- Числовое переполнение и выход за безопасный целочисленный диапазон запрещены.
- Сохранённый Calculation содержит measurements[], независимые снимки configuration по ID замеров и schemaVersion=3.
- Dexie v2 мигрирует старые одиночные окна: размеры из старой секции переходят в окно, hardwareId в активную секцию. Расчёт восстанавливается по сохранённым тарифам через application; цена не рассчитывается в storage. Ошибка миграции откатывает транзакцию без удаления записи.
- Текущая цена и эскиз пересчитываются из текущего ввода. При невалидном вводе они недоступны и сохранить нельзя; устаревший расчёт не показывается.
- IndexedDB локальна; серверное хранение, backend/auth/payments/subscriptions отсутствуют.
- PDF не имеет исполняемого сценария.

## WindowFinish — самостоятельная отделка

- kind='WindowFinish'; обязательны room/name и положительные конечные widthMm/heightMm/depthMm. Выбирается slope, sill или оба, без повторений; один соответствующий материал на вид отделки.
- Геометрия отделки независима от идентичности замера и пригодна для будущего flow окна. Откосы — три детали width/height/height; подоконник — одна width. Установленная длина откосов (width + 2×height)/1000, подоконника width/1000.
- Припуск длины lengthAllowancePerPieceMm добавляется один раз к каждой физической детали, припуск глубины — к общей глубине. Они не меняют установленную длину. Припуски и кратность задаются конфигурацией; дополнительного процента отходов нет.
- Для КАЖДОЙ детали: requiredLengthMm = installedLengthMm + lengthAllowancePerPieceMm; purchaseLengthMm = ceil(requiredLengthMm / purchaseStepMm) × purchaseStepMm. Шаг 0 означает purchaseLengthMm = requiredLengthMm. Только после округления деталей их закупочные длины суммируются. Откосы — top/left/right, подоконник — sill. Это консервативная модель «каждая деталь отдельно», без оптимизации раскроя и использования обрезков между деталями.
- Контроль без припусков при шаге 250 мм: 1400/2100/2100 → 1500/2250/2250, закупка 6000 мм, установленная длина для работы 5600 мм. FinishPiece возвращает свою purchaseLengthMm; итог материала — сумма этих значений.
- Только шум IEEE-754 около целой кратности (8×EPS×max(1, quotient)) не вызывает лишний шаг. Иные размеры не корректируются.
- FinishMaterialConfiguration содержит id/name/finishType, sizing и pricing. Simple задаёт продажную ставку и нормализуется в базовую ставку с нулевой наценкой; Advanced задаёт закупочную ставку и наценку. Pricing Engine принимает только NormalizedFinishMaterial и не знает режим настройки.
- Необязательные диапазоны глубины имеют строго возрастающие положительные верхние границы включительно. Выбирается первая граница >= глубины материала С ПРИПУСКОМ. Выход за последний диапазон — ошибка, без скрытой цены. Пустой список означает единую ставку.
- Продажа материала = закупочная длина × нормализованная ставка × (1 + materialMarkupPercent/100). materialMarkupPercent — коммерческая наценка, не технологический запас. Работа = фактическая установленная длина × workRatePerM. На работу не применяются наценка, припуски или закупочная кратность.
- В Simple базовая стоимость не является известной себестоимостью: это продажная база с нулевой отдельной наценкой. UI явно сообщает это. Тарифы/проценты конечны и >=0; переполнение запрещено.
- Промежуточные денежные значения не округляются; итог суммы материалов и работы округляется один раз до копеек. Отображаемые округлённые строки могут отличаться от итога на копейку.
- MeasurementEstimate объединяет WindowEstimate и FinishEstimate по measurement.kind. Отделка сохраняет исходную конфигурацию в Calculation; нормализованные материалы возвращаются оценкой, результат пересчитывается через estimateFinish.
- IndexedDB v3 хранит окна и отделку в measurements одного Calculation. Невалидная отделка не показывает устаревшую цену и не сохраняется. Подключение отделки к flow окна — вне текущей реализации.
- При миграции и загрузке старой отделки: measurement и тарифы используются для нового расчёта по деталям, сохранённые geometry/price не считаются актуальными. Устаревший процент отходов игнорируется и не переносится в новый снимок sizing; исходный v2-снимок остаётся в резервной таблице legacyCalculations. Историческое поле допустимо только в тесте совместимости. Имя lengthAllowancePerPieceMm сохранено для совместимости припусков.

## Balcony block — вариант WindowMeasurement

- `kind='Window', windowType='balconyBlock'` — ветка того же discriminated union. Не создавать независимый BalconyBlockMeasurement и не использовать BalconyMeasurement для блока.
- Ровно одна дверь и 1 или 2 окна. Оконные секции хранятся в plane.sections в стабильном порядке Window1/Window2; door использует общий OpeningElement/Opening. Все ID внутри блока уникальны.
- Для одного окна doorPosition допускает только left/right; для двух — left/middle/right. Соответствующий порядок: D/W1/W2, W1/D/W2, W1/W2/D. Порядок и координаты для SVG задаёт только domain geometry.
- doorWidthMm/doorHeightMm задаются явно; windowHeightMm общая для окон; каждое окно имеет собственную widthMm. Все размеры конечны и > 0. Нет общей входной ширины/высоты блока и нет автоматического распределения ширин. Фрамуга блока пока не поддерживается.
- Дверь использует те же fixed/turn/tilt_turn и правила hingeSide/hardwareId, что окна. У fixed нет петель/фурнитуры; каждый активный элемент требует совместимую фурнитуру. Hardware не создаёт отдельной цены.
- totalAreaM2 — сумма реальных площадей двери и окон, НИКОГДА площадь bounding rectangle. Контроль: окно 1400×1500 + дверь 700×2200 = 3,64 м². activeAreaM2 — сумма только активных элементов.
- Площади суммируются в стабильном порядке окон и двери, независимо от doorPosition, чтобы перестановка не меняла цену даже из-за floating-point arithmetic.
- Элементы выровнены по верхнему краю (y=0). Габарит для viewBox: сумма ширин × максимальная высота. Промежутки под короткими элементами не рисуются и не оцениваются. Не вводить скрытую высоту подоконника; дверь не обязана быть выше окна.
- Geometry.sections содержит упорядоченные прямоугольники окон И двери. Общая функция openingSymbols и единственный WindowPreview используются для всех типов.
- В новом черновике блока размеры и позиция пусты; новые элементы видимо выбираются fixed. При активации петли первоначально left, фурнитуру пользователь выбирает явно. Пока ввод неполный/невалидный, цена/сохранение недоступны.
- Изменение позиции двери не меняет элементы. Переход 2→1 временно сохраняет второе окно в черновике; 1→2 его восстанавливает. Новое второе окно имеет пустую ширину. Middle при одном окне остаётся видимой ошибкой до явного выбора left/right, а не исправляется скрыто.
- Прямоугольный и блочный черновики сохраняются в памяти при переключении между ними. В IndexedDB сохраняется только текущий валидный Calculation, без скрытого второго окна и других черновиков. После reload/load временные черновики сбрасываются.
- Балконный блок сохраняется как Window внутри Calculation v3. Восстановление пересчитывает geometry/price через application. Тесты цепочки v1→v2→v3 остаются обязательными.

## Calculation и смета

- Calculation v3: id, createdAt/updatedAt (ISO), optional clientName/clientPhone/objectAddress, measurements[], orderAdditionalWorks: AdditionalWork[] и configuration[measurementId]. Контейнер не импортирует geometry/pricing, не знает формулы конкретного замера.
- Measurement = Window | WindowFinish | Balcony. estimateMeasurement делегирует в estimateWindow/estimateFinish/estimateBalcony; контейнер Calculation не знает формул.
- estimateMeasurement делегирует существующим estimateWindow/estimateFinish. MeasurementEstimate = WindowEstimate | FinishEstimate | BalconyEstimate содержит measurement/configuration/geometry/price; FinishEstimate дополнительно normalizedMaterials. Сохранён прежний schemaVersion=2 результата одного замера для совместимости адаптера старых записей; это не версия Calculation v3.
- estimateCalculation возвращает строки, measurementsSubtotalMinor, orderWorksTotalMinor и subtotalMinor — сумму замеров и работ заказа, с проверкой безопасного диапазона. UI не считает subtotal или цены.
- При добавлении ID уникален внутри Calculation; при редактировании тот же ID и позиция. Копия получает новый ID, независимые вложенные параметры и тарифы. ID plane выводится из нового ID окна, локальные ID секций/двери сохраняются (их область уникальности — один замер).
- Удаление удаляет только выбранный замер и его snapshot. Обновления не мутируют исходный Calculation. Тарифы у замеров независимы: изменение тарифа одного не переоценивает остальные.
- ID и текущее время передаются application извне; UI использует crypto.randomUUID и ISO-время. Даты старых записей отсутствовали: при миграции обе даты равны времени миграции.
- IndexedDB v3: calculations (id,updatedAt), settings (последний открытый ID), legacyCalculations (исходные v2-записи). Каждая старая запись становится отдельным Calculation с одним замером и прежним ID; несвязанные демо-записи автоматически не объединяются. Миграция атомарна, повреждение любой записи откатывает всю транзакцию. Миграция v1 проходит через v2.
- Сохранение всего Calculation и активного ID атомарно. Новый расчёт не перезаписывает старые. Reload открывает последний выбранный расчёт. Несохранённые поля editor не восстанавливаются; поля клиента сохраняются отдельной явной кнопкой.
- Calculation, pricing и geometry независимы от auth/subscription. Будущий Access layer контролирует доступ снаружи; проверки подписки внутри domain или Pricing Engine запрещены.

## Дополнительные работы двух уровней

- AdditionalWork = { id, name, priceMinor }. ID и название непустые; ID уникальны внутри списка; priceMinor — неотрицательное безопасное целое число копеек, ноль допустим.
- Window, WindowFinish и Balcony содержат additionalWorks[]; Calculation содержит orderAdditionalWorks[]. Работы заказа не принадлежат отдельному замеру.
- Только application/estimate складывает стоимость: basePriceMinor + additionalWorksTotalMinor = measurementTotalMinor; measurementsSubtotalMinor + orderWorksTotalMinor = subtotalMinor. MeasurementEstimate.price остаётся базовым результатом Pricing Engine. На дополнительные работы не применяются наценки материалов или профиля.
- Копия замера получает независимые работы с новыми ID, образованными из нового ID замера и индекса с проверкой коллизий. Редактирование сохраняет ID замера и существующих работ. Удаление замера удаляет его работы, но сохраняет работы заказа.
- IndexedDB остаётся v3. Отсутствующие additionalWorks/orderAdditionalWorks старых v3-записей нормализуются в []; повреждённые значения не игнорируются. Чтение не перезаписывает исходную запись; новая форма сохраняется при явном сохранении. Миграции v1/v2 сохраняются.
- Работы замера сохраняются вместе с editor. Работы заказа применяются явной кнопкой сохранения; до этого subtotal отражает сохранённый список. Неполные/невалидные работы запрещают сохранение. Количество, единицы и formula builder пока не реализованы.

## BalconyMeasurement — самостоятельное остекление балкона

- kind=Balcony, balconyType=straight/L/U, material=pvc/aluminium, profileId, lamination, room/name, planes[], additionalWorks[]. Это не Window balconyBlock.
- straight содержит facade; L-left — left/facade; L-right — facade/right; U — left/facade/right. Side допустим только для L. ID плоскостей уникальны внутри замера, ID секций — внутри плоскости.
- Общий GlazingPlane параметризован типом Section. BalconyPlane добавляет name/position, widthMm/heightMm, sectionCount (1–8), levels. Window сохраняет прежний контракт и открывания.
- Первое создание и смена sectionCount дают равные fixed секции. После создания изменение ширины плоскости не меняет секции. Явное «Распределить поровну» сохраняет открывания. Сумма ширин проверяется с тем же IEEE-754 допуском, что Window, без коррекции ввода.
- levels: {mode: oneLevel} либо {mode: twoLevel, splitHeightMm, lowerFill: glass/sandwich}. splitHeightMm — ВЫСОТА НИЖНЕГО яруса от низа, строго между 0 и heightMm. Верхняя высота = heightMm − splitHeightMm. Нижние секции наследуют ширины/координаты верхних и всегда fixed.
- PVC допускает fixed/turn/tilt_turn; turn/tilt_turn требуют петли и совместимую фурнитуру. Aluminium допускает fixed/sliding; sliding активно, но hingeSide/hardwareId запрещены. Это не меняет существующих правил Window aluminium.
- totalAreaM2 — сумма площадей реальных плоскостей. activeAreaM2 — сумма активных верхних секций, включая sliding. sandwichAreaM2 — сумма площадей нижних ярусов с sandwich. Общий bounding rectangle не используется для цены.
- Geometry задаёт прямоугольники, splitLine и opening symbols. Общий WindowPreview рисует каждую плоскость отдельно с одним scale X/Y. Стрелка sliding символическая, не задаёт направление движения в модели.
- estimateBalcony вызывает существующий priceGlazing, затем общий application расчёт additionalWorks. Sandwich входит в totalArea по той же ставке; отдельная поправка пока отсутствует. Hardware не создаёт отдельной надбавки.
- Calculation/MeasurementEstimate/configuration snapshots расширены веткой Balcony. Copy глубоко копирует planes/levels/sections/configuration/works; ID плоскостей и секций локальны и могут сохраняться в копии, ID работ обновляются.
- IndexedDB остаётся v3: форма контейнера и индексы не меняются. Старые Window/WindowFinish записи читаются по прежним правилам; новая ветка нормализуется через estimateBalcony. Нет destructive migration.
- В editor новая плоскость имеет пустые размеры; первая валидная ширина создаёт равные секции. Смена формы сохраняет общие стороны и удаляет отсутствующие (правило показано в UI). Смена material явно сбрасывает открывания в fixed и profileId. Верхние активные PVC створки начинают с видимых левых петель и требуют явного выбора hardware.
- Отделка балкона, PDF/DocumentSettings и серверные функции не реализованы. Domain/geometry/pricing остаются независимыми от будущего Access layer.

## Скидки и фиксированная цена Calculation

- Calculation.discount — union none / percent(discountPercent) / fixedFinalPrice(fixedFinalPriceMinor, confirmation, confirmedSubtotalMinor). Скидка относится ко всему заказу, включая работы; не хранится у замеров.
- Percent конечен и в диапазоне 0–100. Application округляет subtotal × percent / 100 один раз до целой копейки (половина вверх), затем вычитает целые суммы. Для корректного округления десятичного процента используются промежуточные BigInt, не сохраняемые в IndexedDB. Pricing Engines не меняются.
- Fixed price — безопасное целое >=0 и <= текущего subtotal при установке/подтверждении. Скидка = subtotal − fixed price. Отрицательных скидок нет.
- Все application операции сохранения/add/edit/copy/delete замера и изменения order works инвалидируют fixed price, даже при совпадении subtotal. Редактирование клиента/объекта не инвалидирует. Percent автоматически применяется к новому subtotal.
- confirmation=needsConfirmation сохраняется до явного подтверждения или сброса. confirmedSubtotalMinor дополнительно защищает при чтении/сохранении от несовпадения subtotal. Возврат к старому subtotal не снимает уже установленный needsConfirmation.
- Pending fixed price хранит прежнюю сумму даже если новый subtotal меньше неё. В этом случае оставить её нельзя; требуется сброс или новая допустимая цена. Это допустимый черновик, не финализированная смета.
- estimateCalculation содержит discountMode, discountAmountMinor, finalTotalMinor, fixedFinalPriceConfirmation, fixedFinalPriceMinor, canConfirmFixedPrice и isFinalized. При pending обе итоговые денежные величины discountAmountMinor/finalTotalMinor равны null, isFinalized=false. Никогда не трактовать null как ноль или готовую цену.
- Старые v3 без discount нормализуются в none без перезаписи при чтении. Версия IndexedDB остаётся v3. Подтверждение и снимок subtotal сохраняются вместе с Calculation. UI только вызывает application и показывает результат; browser confirm/alert не используется.

## Команды проверок

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
