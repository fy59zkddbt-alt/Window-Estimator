# SaaS-правила Window Estimator

Краткий контекст для будущих Codex-чатов. Правила устройств и платной подписки ниже — решения для будущих features, а не уже реализованная функциональность.

## Авторизация и доступ

- Auth — через Supabase; подтверждение email обязательно.
- Server — source of truth по entitlement. Frontend не может сам выставлять `active`, продлевать trial или менять server-side access state.
- Trial — 14 дней без карты; создаётся один раз после подтверждённой авторизации.
- Статусы: `trial`, `active`, `expired`, `blocked`. `trial` и `active` дают доступ; `expired` блокирует рабочий интерфейс, сохраняя локальные данные. `blocked` имеет приоритет над остальными статусами и запрещает доступ.
- Серверный admin override допускается для beta/служебного доступа и не отменяет `blocked`.
- Предупреждение об окончании доступа показывается за 5 дней.
- Offline grace — до 24 часов, но не дольше известного `validUntil`.

## Данные и настройки

- Calculations, measurements, client data и PDF остаются локальными.
- `CalculatorSettings` и `DocumentSettings` синхронизируются через Supabase: cloud — source of truth, IndexedDB — cache.
- Existing measurements используют pricing snapshots: новые глобальные настройки не меняют их цену.

## Устройства — будущий feature

- Ориентир: 1 пользователь ≈ до 2 trusted devices.
- Новый trial не должен автоматически выдаваться на устройстве, где trial уже использовался другим аккаунтом. Точная device logic определяется отдельным feature.

## Платная подписка — будущий feature

- Paid subscription — рекуррентная.
- Отмена отключает автопродление; доступ сохраняется до конца оплаченного периода. До конца периода подписку можно возобновить.
- Payment provider + webhook — source of truth по оплате; entitlement обновляется на сервере.

Технические детали: [Auth foundation](auth-foundation.md), [Cloud Settings](cloud-settings.md), [Entitlement + trial](entitlement-trial.md). Архитектурные ограничения: [AGENTS.md](../AGENTS.md).
