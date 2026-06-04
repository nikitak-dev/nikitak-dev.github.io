<!-- Short UA companion for the db-merge ABOUT modal.
     The rendered EN version lives in DbMergeDocs.astro next to this file.
     Deep technical docs are kept local-only (not published). -->

# DB_MERGE — огляд

*EN version: [DbMergeDocs.astro](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/src/components/docs/DbMergeDocs.astro)*

---

### // WHAT IT DOES

Дає єдине джерело правди, яке не треба збирати вручну: одну таблицю, що залишається актуальною, не містить дублікатів і читається однаково всюди, куди дивиться команда.

### // HOW IT WORKS

Кожне джерело підтягується за розкладом, його несумісні поля зводяться до єдиної форми, потім збагачуються спільними довідковими даними. Кожен запис отримує стійкий ключ, і цей ключ керує upsert (вставкою або оновленням): кожен запуск оновлює вже наявні рядки, а не додає нові копії. Якщо джерело повернуло порожньо, запуск зупиняється й піднімає прапорець, а не перезаписує коректні дані порожнечею.

### // GOOD TO KNOW

Серверна автоматизація — керувати тут нічим. Демонстрація працює на синтетичних банківських записах і тримає Google Sheet та базу Airtable синхронними, надсилаючи короткий підсумок у командний чат після кожного запуску.
