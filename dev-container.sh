#!/bin/bash
set -euo pipefail
PORT=2020
KEY_PATH="$HOME/.ssh/dev-container"
if [[ ! -f "$KEY_PATH" ]]; then
    mkdir -p "$(dirname "$KEY_PATH")"
    ssh-keygen -t ed25519 -f "$KEY_PATH" -N "" -q
    echo "generated ssh key $KEY_PATH"
else
    echo "using ssh key $KEY_PATH"
fi
PUBKEY_PATH="$KEY_PATH.pub"
PROJECT=$(basename $(pwd))
CONTAINER="dev-container-$PROJECT"
RECREATE=false
ERASE=false
STOP=false
for arg in "$@"; do
    if [[ "$arg" == "--recreate" ]]; then
        RECREATE=true
    fi
    if [[ "$arg" == "--erase" ]]; then
        ERASE=true
    fi
    if [[ "$arg" == "--stop" ]]; then
        STOP=true
    fi
done
if command -v service >/dev/null 2>&1; then
    sudo service docker status &> /dev/null || echo "Starting docker service" && sudo service docker start
fi
if ! $RECREATE; then
    if sudo docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
        if $STOP; then
            echo "stopping dev container"
            sudo docker stop "$CONTAINER" 1>/dev/null || true
            exit 0
        fi
        if $ERASE; then
            echo "erasing dev container"
            sudo docker stop "$CONTAINER" 1>/dev/null || true
            sudo docker rm "$CONTAINER" 1>/dev/null || true
            exit 0
        fi
        if sudo docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
            echo "dev container is already running"
	    codium --remote ssh-remote+localhost:$PORT /home/dev/work
            exit 0
        else
            echo "dev container already exists, starting it again"
            sudo docker start "$CONTAINER" 1>/dev/null
	    codium --remote ssh-remote+localhost:$PORT /home/dev/work
            exit 0
        fi
    fi
    if $STOP || $ERASE; then
        echo "dev container does not exist, done"
        exit 0
    fi
fi
export PUBKEY=$(cat "$PUBKEY_PATH")
test -n "$PUBKEY" || exit 1
CREATE_UID=$(id -u)
CREATE_GID=$(id -g)
sudo docker build -t "$CONTAINER" - <<EOF
FROM node:24-slim
USER root
ENV DEBIAN_FRONTEND="noninteractive"
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apt-get update \
	&& apt-get upgrade -y \
	&& apt-get install -y software-properties-common \
	&& apt-get install -y openssh-server wget git zsh graphicsmagick
RUN touch "/root/.hushlogin"
RUN userdel -f node &&\
	if getent group node; then groupdel node; fi &&\
	groupadd devgroup -g ${CREATE_GID} &&\
	useradd -l -s /usr/bin/zsh -u ${CREATE_UID} -g devgroup -m dev
USER dev
RUN touch "/home/dev/.hushlogin" &&\
        echo "#" >> /home/dev/.zshrc
VOLUME /home/dev/work
USER root
RUN mkdir /var/run/sshd
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D"]
EOF
sudo docker stop "$CONTAINER" 1>/dev/null || true
sudo docker rm "$CONTAINER" 1>/dev/null || true
sudo docker run -d -it --name "$CONTAINER" --mount "type=bind,src=$PWD,dst=/home/dev/work" -p "$PORT:22" -p "3000:3000" --hostname dev "$CONTAINER"
sudo docker exec -u dev "$CONTAINER" sh -c "mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && echo '$PUBKEY' >> ~/.ssh/authorized_keys"
codium --remote ssh-remote+localhost:$PORT /home/dev/work
