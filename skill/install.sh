#!/usr/bin/env bash
# install.sh — 将 minecraft-building-design skill 安装到 Hermes
#
# 用法:
#   bash skill/install.sh                  # 安装到当前用户的 Hermes
#   bash skill/install.sh --profile meo    # 安装到指定 profile
#   bash skill/install.sh --help           # 显示帮助

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$SCRIPT_DIR/minecraft-building-design"

HERMES_BASE="${HERMES_PROFILES_DIR:-$HOME/.hermes}"
PROFILE="${HERMES_PROFILE:-default}"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --help)
      echo "用法: bash skill/install.sh [--profile <name>]"
      echo ""
      echo "将 minecraft-building-design skill 安装到 Hermes Agent。"
      echo ""
      echo "选项:"
      echo "  --profile <name>  目标 profile (默认: default)"
      echo "  --help            显示此帮助"
      exit 0
      ;;
    *)
      echo "❌ 未知选项: $1"
      echo "用法: bash skill/install.sh [--profile <name>]"
      exit 1
      ;;
  esac
done

TARGET="${HERMES_BASE}/profiles/${PROFILE}/skills/creative/minecraft-building-design"

echo "📦 安装 minecraft-building-design skill..."
echo "   源: $SKILL_DIR"
echo "   目标: $TARGET"
echo "   Profile: $PROFILE"
echo ""

# 创建目标目录
mkdir -p "$TARGET"

# 复制所有文件（排除隐藏文件和 .git）
rsync -av --exclude='.git' --exclude='*.pyc' --exclude='__pycache__' \
  "$SKILL_DIR/" "$TARGET/"

echo ""
echo "✅ 安装完成！在 Hermes 中使用:"
echo ""
echo "   skill_view(name='minecraft-building-design')"
echo ""
echo "   或通过 skill_manage:"
echo "   skill_manage(action='create', name='minecraft-building-design', ...)"
echo ""
echo "Python 脚本路径:"
echo "   $TARGET/scripts/"
echo "格式文档路径:"
echo "   $TARGET/references/formats/"
