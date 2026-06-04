<!-- Short UA companion for the folder-clone ABOUT modal.
     The rendered EN version lives in FolderCloneDocs.astro next to this file.
     Deep technical docs are kept local-only (not published). -->

# FOLDER_CLONE — огляд

*EN version: [FolderCloneDocs.astro](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/src/components/docs/FolderCloneDocs.astro)*

---

### // WHAT IT DOES

Віддає повну, точну копію папки Google Drive — кожен вкладений рівень на місці, нічого не сплющено й не загублено — в окремому зрозуміло названому робочому просторі, готовому до передачі.

### // HOW IT WORKS

Ви даєте посилання на папку та ім'я — створюється датована цільова папка, і джерело обходиться згори вниз: кожна підпапка відтворюється, а її файли копіюються пакетами. Коли дерево пройдено, у нову папку кладеться звіт — усього файлів і папок, з розбивкою за типами — і надходить сповіщення, що копія готова.

### // GOOD TO KNOW

Серверна автоматизація, запускається з короткої форми — пробувати тут нічого. Копіює у власний Drive оператора й позначає кожну нову папку ім'ям клієнта та датою, тож повторні запуски не перетинаються.
