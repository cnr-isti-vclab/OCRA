FROM pytorch/pytorch:2.5.1-cuda12.1-cudnn9-runtime

ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends git curl \
    && rm -rf /var/lib/apt/lists/*

# Pinned to the commit OCRA was tested against. No CUDA extension: the image
# predictor does not use it. --no-build-isolation reuses the base image's torch.
ARG SAM2_COMMIT=2b90b9f5ceec907a1c18123530e92e794ad901a4
RUN SAM2_BUILD_CUDA=0 pip install --no-cache-dir --no-build-isolation \
      "git+https://github.com/facebookresearch/sam2.git@${SAM2_COMMIT}" \
    && pip install --no-cache-dir flask gunicorn

# The checkpoint for MODEL_SIZE is baked in, so the image runs on its own.
ARG MODEL_SIZE=tiny
ENV MODEL_SIZE=${MODEL_SIZE} APP_ROOT=/opt/sam2
RUN case "${MODEL_SIZE}" in \
      tiny|small|base_plus|large) ;; \
      *) echo "unknown MODEL_SIZE: ${MODEL_SIZE}" >&2; exit 1 ;; \
    esac && \
    mkdir -p ${APP_ROOT}/checkpoints && \
    curl -fL -o ${APP_ROOT}/checkpoints/sam2.1_hiera_${MODEL_SIZE}.pt \
      https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_${MODEL_SIZE}.pt

WORKDIR /app
COPY app.py .

# One worker holds one copy of the model; requests take turns on it.
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--threads", "4", "--timeout", "120", "app:app"]
