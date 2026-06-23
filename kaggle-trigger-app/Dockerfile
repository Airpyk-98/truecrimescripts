FROM node:22-bookworm

# Install Python 3 and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

ENV PIP_BREAK_SYSTEM_PACKAGES=1

# Install Kaggle CLI
RUN pip3 install --no-cache-dir --upgrade kaggle

# Configure app directory permissions for the existing 'node' user (UID 1000)
WORKDIR /app
RUN mkdir -p /app && chown -R node:node /app
USER node

# Copy package config and install dependencies
COPY --chown=node:node package.json ./
RUN npm install

# Copy application files
COPY --chown=node:node . .

# Expose Hugging Face default port
EXPOSE 7860
ENV PORT=7860

CMD ["npm", "start"]
