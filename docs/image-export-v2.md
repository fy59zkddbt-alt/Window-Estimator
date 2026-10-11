# Feature 13 — Image Export v2

Client View → «Скачать изображение» → PNG. Renderer принимает только
`ProposalDocumentV2`: он не читает Calculation, Feature 5, editor state или
mutable settings. DTO, бизнес-модели, pricing, Feature 5, Settings и PDF не меняются.

## Pipeline

`ui/export/proposal-image-layout.ts` строит детерминированный план страниц из
DTO и функции измерения текста. `render-proposal-images.ts` использует native
Canvas 2D/measureText/fillText/toBlob('image/png'), одну страницу за раз через
async generator. Нет screenshotting, offscreen DOM, foreignObject, remote
assets или новых dependencies.

Ширина 1080 px; высота переменная, не более 3200 px; scale 1 в выходных пикселях,
независимо от viewport/DPR. Arial/sans-serif без внешних fonts. Основной текст
26 px, детали 22 px, общие размеры 22 px, вторичные 18 px, заголовок/итог 42 px. Backing одной
максимальной страницы около 13.2 MiB RGBA плюс временные browser encoding buffers.

Небольшие карточки сохраняются целиком. Oversized карточки делятся между
строками текста и целыми рядами схем с подписью «Позиция N · продолжение».
Summary завершает последнюю страницу, пустая дополнительная страница не создаётся. Если итог не помещается, короткие целые closing cards (отделка/работы) переносятся с ним, чтобы не оставлять отдельный файл только с итогом.
Одиночный замер — один файл; representative 4-item proposal с seller, works и
discount — два. Нет hard limit на количество страниц.

## Клиентская подача

Чтение: название/комната → схема → компактная конфигурация → цена.
`proposal-presentation.ts` используется PNG и Client View. Список generic
properties не выводится целиком: customer metadata имеет явный allowlist.
Нет площади, glass/sandwich/active area, внутренних затрат или коэффициентов. Шапка: название, клиент, адрес/контакт; продавец вторично — company/name и до трёх контактных значений. ИНН, лишние телефоны и длинный список всех реквизитов не выводятся. Дата и внутренний номер расчёта в Client View скрыты.

- Window/Block: профиль и уникальные названия фурнитуры, одна строка выбранной ламинации,
  отдельный реальный цвет при наличии, «Дополнительно: расширители, соединители»
  только для выбранных опций. Нет подробного списка секций/открываний/петель.
- Balcony: заголовки «Левая сторона», «Фасад», «Правая сторона», каждый перед
  своей схемой. До трёх схем в ряду PNG, dense planes >4 sections получают
  полную ширину. Ряд схем 380 px плюс заголовки; ширина плоскостей пропорциональна исходной ширине с одинаковым резервом для размеров. Client View показывает плоскости
  последовательно. После схем — общая компактная конфигурация.
- PVC: профиль, фурнитура, выбранная ламинация без повторного Color alias. «Без ламинации», избыточные ПВХ, тип окна/блока и комната, уже включённая в название, скрыты.
- Aluminium: Алюминий, система, «Цвет: …», раздвижное/распашное. Ламинация не
  выводится. Механизм берётся из готового customer property/plane label DTO.
- Два ряда: нижнее заполнение видно по заливке; общая строка «Низ — …» выводится
  один раз. Если заполнение сторон отличается, note сохраняется у каждой схемы.
  Термин «В пол» не добавляется: отдельного признака установки в пол DTO не имеет.
- Finish: внутренняя/наружная, состав, материалы, «Отделка под ключ» с точной ценой.
  Total не повторяет единственную finish price line; при дополнительных работах
  отдельный total сохраняется.
- Glazing prices: «Изделие», «Монтаж», «Итого». Цены выровнены справа, обычные строки regular, item total bold, final total самый сильный. Длинные строки/очень большие суммы переносятся без обрезки.
- Summary: итог; при скидке также канонические subtotal и discount. Округление
  остаётся в DTO/Feature 5, но не показывается клиенту.

## Схемы и размеры

`glazing-drawing.ts` разделяет с `GlazingScheme` готовые rectangles, opening
polylines, filling, transom и splitLine. `customerSchemeLayout` размещает только
presentation annotations: общий размер, цепочку уникальных ширин секций,
верхнюю/нижнюю высоты, фрамугу, разные высоты окна/двери блока. Координаты секций остаются оригинальными mm из документа: SVG использует
вложенный domain viewBox, canvas — тот же единый fit scale по X/Y. Исходные
точки символов определяют вид и handing; customer overlay символически
размещает их внутри inset glazing, не мутируя исходную геометрию.

Выбранная конвенция: **вид из помещения**. Поворот — сплошные две диагонали с
вершиной на стороне петель (слева/справа соответственно). Откидывание — один
пунктирный символ с вершиной вверх. В customer mode `customerConstruction` сохраняет полные turn и tilt вместе в привычном совмещённом «звездообразном» обозначении внутри стекла. Нормализованные исходные точки сохраняют форму и сторону петель; меняется только размещение внутри inset glazing. Fixed — без символа,
sliding — исходная стрелка. Дополнительные зелёные hinge bars скрыты только в
customer drawings; domain geometry и существующие editor markers не изменены.
SVG и canvas используют общий `customerConstruction`: исходный внешний прямоугольник рамой 3.2 px; символический sash inset 1.8 px у активных; glass contour 1.1 px; opening 1.1 px; dimensions 0.6 px. Insets не являются физической толщиной профиля и не входят в геометрию/цену. Глухая секция имеет раму и стекло без символа. «Вид из помещения» один раз у позиции; «Размеры в мм» один раз в шапке.

Сравнение conventions: [CAD elevation note](https://cadblockdwg.com/blog/window-opening-symbols-on-elevations)
описывает apex на hinge side и необходимость явно задавать точку наблюдения.
[Idealcombi inward turn/tilt reference](https://products.idealcombi.com/en/product/turn-tilt-window/)
использован для проверки смысла inward operation. Это явная конвенция проекта,
а не обещание одинаковой графической нотации всех производителей.

## Money, unresolved, lifecycle

Деньги берутся из display через общий `presentation/customer-money.ts`. BigInt(minor) % 100 проверяет нулевые копейки; только конечное `,00` перед ₽ удаляется. Ненулевые копейки и все точные цифры сохраняются. Нет пересчёта/Number conversion/rounding.
MAX_SAFE_INTEGER, manual finish и fixed final amount сохраняют копейки.
Unresolved экспортируется с «Цена отделки требует уточнения», без выдуманного
итога. Pending fixed result также сохраняет каноническое сообщение DTO.

Файлы: `zamerok-offer.png` либо `zamerok-offer-1.png`, `-2.png` и далее.
Phone/name не используются в filenames. Кнопка disabled при генерации, ref
защищает от повторного запуска, ошибка допускает retry, back остаётся доступен.
Для ограничений multi-file downloads доступны отдельные кнопки страниц;
страница генерируется заново без хранения blob. Web Share/messenger API нет.

Canvas detached; backing обнуляется перед yield и в finally, в том числе при
ошибке/отмене. Temporary anchor удаляется, object URL отзывается через 1 секунду
после browser handoff. Изображения не сохраняются в React, Dexie или server storage.

Между ОС возможны различия системных шрифтов и сглаживания. Native iOS Safari
на Windows-хосте не проверен. Используются стандартные Canvas/PNG/Blob/download
API без foreignObject. Размер/порядок/layout при одинаковых font metrics стабильны.

## Проверки

- `tests/image-export-presentation.test.tsx`: explicit opening cases, dimensions,
  text reduction, PVC/aluminium, filling, Finish/Summary, no new monetary rounding.
- `tests/image-export-v2.test.ts`: DTO boundary, money/unresolved, pagination,
  oversized/long text, resource success/failure/early return.
- `tests/browser/image-export-v2.{html,tsx,cjs}`: 16 content/visual scenarios,
  real PNG bytes/pixels/dimensions, transformed text bounds, all section rectangles,
  viewport independence, downloads/fallback/progress/duplicate/retry/back/cleanup.
- Existing ProposalDocument/Client View/Feature 11/editor regressions preserved.

Browser QA: `node tests/browser/image-export-v2.cjs` against `pnpm dev --host
127.0.0.1`; environment `PLAYWRIGHT_MODULE` and optional `IMAGE_EXPORT_DIR`.

## Final visual review

Review PNGs copied to `review-artifacts/feature-13/`: `pvc-window.png`,
`pvc-u-balcony.png`, `aluminium-balcony.png`, `balcony-block.png`,
`proposal-page-1.png`, `proposal-page-2.png`. Temporary review files must not be committed.
Complex PVC review includes four adjacent tilt-turn sashes, mixed fixed/active side
planes, two rows and sandwich filling. Browser PNG checks include real frame/glass
contours and nonblank ink pixels; repeated identical content pages are valid.
