FROM nvidia/cuda:11.8.0-devel-ubuntu22.04

ARG TZ
ENV TZ="$TZ"
ENV DEBIAN_FRONTEND=noninteractive

# CUDA 环境变量 (针对 RTX 4080/8.6架构优化)
ENV CUDA_HOME=/usr/local/cuda
ENV TORCH_CUDA_ARCH_LIST="8.6"

# Conda 环境变量
ENV CONDA_DIR=/opt/conda
# 不添加 conda 到全局 PATH，保持系统 python 为默认
# conda 命令通过 conda init 设置的 shell 函数提供

# 允许安装 fzf 文档（包含 zsh 集成脚本，基础镜像默认排除了 /usr/share/doc/*）
RUN echo 'path-include=/usr/share/doc/fzf/*' >> /etc/dpkg/dpkg.cfg.d/excludes

# Install basic development tools
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl \
  wget \
  build-essential \
  ca-certificates \
  less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  jq \
  nano \
  vim \
  locales \
  && locale-gen en_US.UTF-8 \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# 设置 locale 环境变量
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

# Install Node.js 20.x + gh CLI
# Node.js 仍然需要保留，用于其他开发工具
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y nodejs gh \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace directory
RUN mkdir -p /workspace /root/.claude

WORKDIR /workspace

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Set the default shell to zsh
ENV SHELL=/bin/zsh

# Set the default editor
ENV EDITOR=nano
ENV VISUAL=nano

# Install zsh with powerlevel10k theme
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Install Miniconda
RUN wget --quiet https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O /tmp/miniconda.sh && \
  /bin/bash /tmp/miniconda.sh -b -p $CONDA_DIR && \
  rm /tmp/miniconda.sh && \
  $CONDA_DIR/bin/conda init bash && $CONDA_DIR/bin/conda init zsh && \
  $CONDA_DIR/bin/conda config --set auto_activate_base false && \
  echo 'source ~/.zshrc' >> ~/.zprofile && \
  sed -i 's/POWERLEVEL9K_LEFT_PROMPT_ELEMENTS=(user/POWERLEVEL9K_LEFT_PROMPT_ELEMENTS=(anaconda user/' ~/.zshrc

# Install Claude Code (native installer, no longer via npm)
RUN curl -fsSL https://claude.ai/install.sh | bash

