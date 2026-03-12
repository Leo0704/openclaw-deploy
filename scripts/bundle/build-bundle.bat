@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM OpenClaw 离线包构建脚本 (Windows)
REM 用法: build-bundle.bat [版本号]
REM 示例: build-bundle.bat 2026.3.8

set OPENCLAW_REPO=https://github.com/openclaw/openclaw.git
set NODE_VERSION=22.12.0
set PLATFORM=win-x64
set SCRIPT_DIR=%~dp0
set OUTPUT_DIR=%SCRIPT_DIR%output

REM 解析参数
set VERSION=%1
if "%VERSION%"=="" set VERSION=2026.3.8

set WORK_DIR=%SCRIPT_DIR%build-%PLATFORM%
set NODE_ARCHIVE=node-v%NODE_VERSION%-win-x64.zip
set NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_ARCHIVE%
set OUTPUT_NAME=openclaw-%PLATFORM%-%VERSION%.zip

echo ==========================================
echo 构建 OpenClaw 离线包
echo ==========================================
echo 版本: %VERSION%
echo 平台: %PLATFORM%
echo Node.js: %NODE_VERSION%
echo ==========================================

REM 创建目录
echo [INFO] 创建工作目录...
if exist "%WORK_DIR%" rmdir /s /q "%WORK_DIR%"
mkdir "%WORK_DIR%"
mkdir "%OUTPUT_DIR%" 2>nul

REM 步骤1: 克隆 OpenClaw
echo [INFO] 步骤 1/5: 克隆 OpenClaw 源码...
if not exist "%WORK_DIR%\openclaw" (
    git clone --depth 1 --branch "v%VERSION%" "%OPENCLAW_REPO%" "%WORK_DIR%\openclaw" || (
        echo [WARN] 指定版本克隆失败，尝试默认分支...
        git clone --depth 1 "%OPENCLAW_REPO%" "%WORK_DIR%\openclaw"
    )
)

REM 步骤2: 安装依赖
echo [INFO] 步骤 2/5: 安装依赖...
cd /d "%WORK_DIR%\openclaw"

REM 检查 pnpm
where pnpm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [INFO] 安装 pnpm...
    npm install -g pnpm@10
)

echo [INFO] 执行 pnpm install...
call pnpm install --frozen-lockfile || call pnpm install

REM 步骤3: 构建
echo [INFO] 步骤 3/5: 构建 OpenClaw...
call pnpm build

REM 步骤4: 下载 Node.js
echo [INFO] 步骤 4/5: 下载 Node.js 运行时...
cd /d "%WORK_DIR%"
if not exist "%NODE_ARCHIVE%" (
    echo [INFO] 下载 %NODE_ARCHIVE%...
    curl -L -o "%NODE_ARCHIVE%" "%NODE_URL%"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Node.js 下载失败
        exit /b 1
    )
) else (
    echo [INFO] Node.js 已存在，跳过下载
)

REM 解压 Node.js
echo [INFO] 解压 Node.js...
mkdir "%WORK_DIR%\bundle\node"
powershell -Command "Expand-Archive -Path '%NODE_ARCHIVE%' -DestinationPath '%WORK_DIR%\node-temp' -Force"
move "%WORK_DIR%\node-temp\node-v%NODE_VERSION%-win-x64\*" "%WORK_DIR%\bundle\node\"
rmdir /s /q "%WORK_DIR%\node-temp"

REM 复制 OpenClaw
echo [INFO] 组装离线包...
xcopy /E /I /Q "%WORK_DIR%\openclaw" "%WORK_DIR%\bundle\openclaw"

REM 创建启动脚本
echo [INFO] 创建启动脚本...
(
echo @echo off
echo chcp 65001 ^>nul
echo setlocal
echo set "SCRIPT_DIR=%%~dp0"
echo set "NODE_PATH=%%SCRIPT_DIR%%node"
echo set "PATH=%%NODE_PATH%%;%%PATH%%"
echo cd /d "%%SCRIPT_DIR%%openclaw"
echo echo Starting OpenClaw...
echo "%%SCRIPT_DIR%%node\node.exe" openclaw.mjs %%*
) > "%WORK_DIR%\bundle\start.bat"

REM 创建版本文件
(
echo openclaw: %VERSION%
echo node: %NODE_VERSION%
echo platform: %PLATFORM%
echo build_date: %date% %time%
) > "%WORK_DIR%\bundle\VERSION"

REM 步骤5: 打包
echo [INFO] 步骤 5/5: 打包...
cd /d "%WORK_DIR%\bundle"
powershell -Command "Compress-Archive -Path '*' -DestinationPath '%OUTPUT_DIR%\%OUTPUT_NAME%' -Force"

REM 清理
echo [INFO] 清理临时文件...
cd /d "%SCRIPT_DIR%"
rmdir /s /q "%WORK_DIR%"

REM 完成
for %%A in ("%OUTPUT_DIR%\%OUTPUT_NAME%") do set SIZE=%%~zA
set /a SIZE_MB=%SIZE% / 1048576

echo ==========================================
echo 构建完成!
echo ==========================================
echo 文件: %OUTPUT_DIR%\%OUTPUT_NAME%
echo 大小: %SIZE_MB% MB
echo ==========================================

pause
