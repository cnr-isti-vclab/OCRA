ARG BASE_IMAGE=pytorch/pytorch:2.5.1-cuda12.1-cudnn9-runtime

FROM ${BASE_IMAGE}

ENV PYTHONUNBUFFERED=1
ENV SAM2_BUILD_CUDA=0
ENV APP_ROOT=/opt/sam2
ARG MODEL_SIZE=tiny
ENV MODEL_SIZE=${MODEL_SIZE}
ENV PORT=5001

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    libgl1 \
    libglib2.0-0 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Pinned to the commit OCRA was built/tested against
ARG SAM2_COMMIT=2b90b9f5ceec907a1c18123530e92e794ad901a4
RUN git clone https://github.com/facebookresearch/sam2.git /tmp/sam2build \
    && cd /tmp/sam2build \
    && git checkout ${SAM2_COMMIT} \
    && pip install --no-cache-dir -e .

# Install service dependencies
RUN pip install --no-cache-dir \
    flask \
    flask-cors \
    requests \
    Pillow \
    opencv-python-headless

# Download the checkpoint matching MODEL_SIZE so the image is runnable on its own
RUN mkdir -p ${APP_ROOT}/checkpoints && \
    case "${MODEL_SIZE}" in \
      tiny) CKPT=sam2.1_hiera_tiny.pt ;; \
      small) CKPT=sam2.1_hiera_small.pt ;; \
      base_plus) CKPT=sam2.1_hiera_base_plus.pt ;; \
      large) CKPT=sam2.1_hiera_large.pt ;; \
      *) echo "unknown MODEL_SIZE: ${MODEL_SIZE}" >&2; exit 1 ;; \
    esac && \
    curl -L -o ${APP_ROOT}/checkpoints/${CKPT} \
      https://dl.fbaipublicfiles.com/segment_anything_2/092824/${CKPT}

COPY sam2-service/app.py /app/app.py
WORKDIR /app

CMD ["python", "app.py"]
