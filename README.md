# ProofForge

SAP process testing framework.

## Overview

ProofForge is a framework for testing and validating SAP business processes. It provides tools for automated verification of process flows, data integrity, and system behavior in SAP environments.

ВАЖНО! Это Specification Driven Development - сначала проясняем все моменты и фиксируем в спецификации - только затем - реализация!

## Specification

Текущий черновик спецификации: [SPECIFICATION.md](./SPECIFICATION.md)

Test Step - Шаг тестирования - атомарная единица тестирования - один шаг, выполняемый одним пользователем или роботом - запуск одной транзакции, ввод одного документа, запуск одного отчета и т.п. Он должен исполняться (execution) и валидироваться (validation). Исполнение может быть успешным/условно успешным/проваленным. Валидаций для одного шага может быть от нуля до нескольких - валидация полученных документов разными участниками, валидация в отчетности и т.п.

Test Scenario - Сценарий тестирования - совокупность Test Steps, которая задает общую последовательность цепочку событий/шагов для исполнения на тесте. Является шаблоном для создания Test Case. Может содержать в себе указание конкретных параметров, но не обязательно.

Test Case - совокупность конкретных Test Steps для выполнения с указанием конкретных параметров для ввода - видов документов/контрагентов - отображает именно реально существующие или предполагаемые случаи хозяйственной жизни.

Test Plan - совокупность Test Case для исполнения в рамках проектной фазы - Functional Test, Integration Test, User Acceptance Test. Может быть привязан к конкретным датам.

Run - конкретный прогон теста на основе Test Scenario или Test Case

Defect - выявленный дефект

Визуальный стиль - минималистично - похоже на Jira

Хранение данных - JSON или подобные форматы - данные реально ожидается не много


## Deployment

Target VPS: `94.23.107.11` (Docker-based deployment)

## License

MIT
