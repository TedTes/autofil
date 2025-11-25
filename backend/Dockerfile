# Use Python 3.11 slim as base image (Debian Bookworm)
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # OpenCV dependencies (updated for Debian)
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    # FFmpeg libraries for OpenCV
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    # Ghostscript for Camelot
    ghostscript \
    # Tkinter for table extraction
    python3-tk \
    tk-dev \
    # Poppler for pdf2image (OCR)
    poppler-utils \
    # Tesseract for OCR
    tesseract-ocr \
    tesseract-ocr-eng \
    libtesseract-dev \
    # Java for Tabula
    default-jre-headless \
    # Build dependencies
    gcc \
    g++ \
    make \
    # libmagic for python-magic
    libmagic1 \
    file \
    # Additional dependencies
    libpng-dev \
    libjpeg-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for layer caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (Railway will set $PORT dynamically)
EXPOSE 8000

# Run with gunicorn
CMD gunicorn --bind 0.0.0.0:${PORT:-8000} \
    --workers 2 \
    --threads 4 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    main:app
