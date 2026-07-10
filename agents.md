\## 1. Development stage rule



This application is still in a pre-release stage. It currently has no real users and no real production data.



Agents may make structural changes freely when needed, including database schema changes, UI changes, API changes, and logic refactors. Do not over-optimize for backward compatibility at this stage.



Production constraints, real user data safety, migrations, and long-term compatibility will be handled before the official release.



\---



\## 2. AgentMD purpose rule



The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project.



If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue.

## 3. Text encoding rule

This repository contains Chinese, Greek, and English source text. Always preserve files as UTF-8 when editing locale files or visible UI copy. PowerShell output encoding can make valid UTF-8 Greek look damaged, so verify suspected corruption from the file bytes before rewriting a locale. If a visible character is actually damaged in source, repair it and record the finding here.
