# Mini OJ

Mini OJ 是一個輕量級的本地 Online Judge，用來練習程式題目、儲存題目、記錄解題狀態，並支援 Docker 部署。

目前支援：

- C++
- C
- Python
- 自訂輸入與標準答案
- 題目儲存
- 題目歷史紀錄
- Attempt / AC 次數追蹤
- Markdown 題目預覽
- Markdown 題目匯入
- Docker 部署

---

## 1. 使用 Docker 快速啟動

### Step 1：準備 `.env`

先複製範例環境設定檔：

```bash
cp .env.example .env
```

預設 `.env.example` 內容如下：

```env
MINIOJ_IMAGE=ghcr.io/brianlin1213/proj-mini-oj:latest
CONTAINER_NAME=mini-oj
PORT=3000
APP_ENV=release
APP_LABEL=Release Version
DATA_DIR=./data
```

如果要改 port，例如改成 `3001`，只需要改：

```env
PORT=3001
```

---

### Step 2：啟動 Mini OJ

```bash
docker compose up -d
```

啟動後打開：

```text
http://localhost:3000
```

如果 Mini OJ 是跑在另一台主機上，例如 Raspberry Pi，請改用該主機的 IP：

```text
http://<你的主機 IP>:3000
```

例如：

```text
http://192.168.0.17:3000
```

---

### Step 3：停止 Mini OJ

```bash
docker compose down
```

---

### Step 4：更新 Mini OJ

```bash
docker compose pull
docker compose up -d
```

你的題目資料會存在本機的 `data/` 資料夾，不會因為更新 Docker image 而被刪除。

---

## 2. 資料儲存位置

Mini OJ 會把題目資料存在：

```text
data/problems.json
```

在 Docker container 裡面，這個資料夾會被掛載到：

```text
/app/data
```

也就是：

```text
本機 ./data
↓
Docker container /app/data
```

所以就算 container 被關掉、重啟、更新 image，題目資料仍然會保留在本機。

---

## 3. Linux 權限問題

如果在 Linux 或 Raspberry Pi 上遇到類似錯誤：

```text
EACCES: permission denied, open '/app/data/problems.json'
```

代表 Docker container 沒有權限寫入本機的 `data/` 資料夾。

可以執行：

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

這是因為 container 裡面的 Node.js 預設使用 UID `1000` 的使用者執行。

---

## 4. 匯入題目格式

Mini OJ 支援用 Markdown 格式匯入題目。

匯入方式：

1. 點擊 `+ Import`
2. Source 選擇 `Mini OJ Markdown`
3. 貼上題目的 Markdown 內容
4. 點擊 `Load`

---

## 5. Mini OJ Markdown 基本格式

題目格式建議如下：

````markdown
# 題號 - 題目名稱

## Description

在這裡寫題目敘述。

可以使用一般 Markdown。

也可以使用 code block：

```text
example text
```

## Input

在這裡寫輸入格式。

## Output

在這裡寫輸出格式。

## Sample Input

在這裡放一組可以用來測試的輸入。

匯入後，這一段會自動填到 Mini OJ 的 `Input` 欄位。

## Sample Output

在這裡放上面那組輸入對應的正確輸出。

匯入後，這一段會自動填到 Mini OJ 的 `Expected Output` / `Answer` 欄位。

## Source

在這裡寫題目來源。
````

---

## 6. 題目格式範例

以下是一個可以直接匯入的題目格式範例。

匯入時請選擇：

```text
Mini OJ Markdown
```

範例：

````markdown
# 10954 - Add All

## Description

Given a set of positive integers, you need to add all numbers into one final number.

However, each addition has a cost.

When two numbers `a` and `b` are added, the cost is:

```text
a + b
```

The result `a + b` is then inserted back into the set and can be used in later additions.

Your task is to determine the minimum total cost required to add all numbers.

## Input

The input contains several test cases.

Each test case begins with an integer:

```text
N
```

where `N` is the number of integers.

If `N` is `0`, the input ends.

The next line contains `N` positive integers.

Each integer is less than `100000`.

## Output

For each test case, output the minimum total cost of addition in a single line.

## Sample Input

```text
3
1 2 3
4
1 2 3 4
0
```

## Sample Output

```text
9
19
```

## Source

UVa / GPE Practice
````

`## Input` 和 `## Output` 是題目規格說明；真正會拿來執行測試的資料請放在 `## Sample Input` 和 `## Sample Output`。

匯入成功後：

- `Sample Input` 會自動填入畫面下方的 `Input` 測資欄位
- `Sample Output` 會自動填入 `Expected Output` / `Answer` 欄位
- 題目敘述預覽會保留 Description、Input、Output、Source 等內容
- Sample 區塊不會重複顯示在題目敘述預覽裡

---

## 7. Frontmatter 進階格式

Mini OJ Markdown 也支援選填的 frontmatter。

frontmatter 可以用來指定題目 ID、題目標題、來源與預設語言。

格式如下：

````markdown
---
source: gpe
id: 20260713_Q1
title: 10954 - Add All
language: cpp
---

# 10954 - Add All

## Description

Problem description here.

## Input

Input format here.

## Output

Output format here.

## Sample Input

```text
sample input here
```

## Sample Output

```text
sample output here
```

## Source

UVa / GPE Practice
````

欄位說明：

```text
source    題目來源標籤，例如 gpe、uva、nthu、markdown
id        Mini OJ 內部使用的題目 ID
title     題目標題
language  預設語言，例如 cpp、c、python
```

如果沒有提供 frontmatter，Mini OJ 會使用第一個 `# heading` 當作題目標題。

例如：

```markdown
# 10954 - Add All
```

會被當成題目名稱。

---

## 8. 匯入後的行為

匯入題目後：

- Problem ID 會自動產生，或使用 frontmatter 裡的 `id`
- Problem Title 會使用第一個 `# heading`，或使用 frontmatter 裡的 `title`
- Problem Statement 會顯示在 Markdown Preview
- Code editor 會保持空白
- 題目可以手動 Save
- 目前版本支援匯入後自動存檔

---

## 9. 開發模式

開發時可以使用本機 build 的 Docker image。

開發用 `.env` 範例：

```env
MINIOJ_IMAGE=mini-oj:dev
CONTAINER_NAME=mini-oj-dev
PORT=3001
APP_ENV=develop
APP_LABEL=Develop Version
DATA_DIR=./data
```

建立本機 dev image：

```bash
docker build -t mini-oj:dev .
```

啟動 dev container：

```bash
docker compose up -d
```

打開：

```text
http://localhost:3001
```

如果是在 Raspberry Pi 上執行，請使用 Raspberry Pi 的 IP：

```text
http://<你的 Raspberry Pi IP>:3001
```

---

## 10. 常用 Docker 指令

查看 container 狀態：

```bash
docker compose ps
```

查看 log：

```bash
docker compose logs -f
```

停止服務：

```bash
docker compose down
```

重新啟動：

```bash
docker compose up -d
```

重新 build 本機 image：

```bash
docker build -t mini-oj:dev .
```

重新 build 並啟動：

```bash
docker build -t mini-oj:dev .
docker compose up -d
```

進入 container：

```bash
docker exec -it mini-oj-dev sh
```

---

## 11. 安全提醒

Mini OJ 會編譯並執行使用者提交的程式碼。

目前適合用於：

- 個人本機練習
- 區域網路內部使用
- Raspberry Pi / 自架主機上的私人練習環境

不建議直接公開到 Internet。

如果要公開給多人使用，需要再加入更嚴格的 sandbox、安全限制、資源限制與權限隔離。
