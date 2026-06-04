<!-- Short RU companion for the folder-clone ABOUT modal.
     The rendered EN version lives in FolderCloneDocs.astro next to this file.
     Deep technical docs are kept local-only (not published). -->

# FOLDER_CLONE — обзор

*EN version: [FolderCloneDocs.astro](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/src/components/docs/FolderCloneDocs.astro)*

---

### // WHAT IT DOES

Отдаёт полную, точную копию папки Google Drive — каждый вложенный уровень на месте, ничего не сплющено и не потеряно — в отдельном понятно названном рабочем пространстве, готовом к передаче.

### // HOW IT WORKS

Вы даёте ссылку на папку и имя — создаётся датированная целевая папка, и источник обходится сверху вниз: каждая подпапка пересоздаётся, а её файлы копируются пакетами. Когда дерево пройдено, в новую папку кладётся отчёт — всего файлов и папок, с разбивкой по типам — и приходит уведомление, что копия готова.

### // GOOD TO KNOW

Серверная автоматизация, запускается из короткой формы — пробовать здесь нечего. Копирует в собственный Drive оператора и помечает каждую новую папку именем клиента и датой, так что повторные запуски не пересекаются.
