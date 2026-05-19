FROM node:22

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_API_URL=http://localhost:4000/api
ARG VITE_ALLOWED_HOSTS=.run.app,med.stohler.com.br
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_ALLOWED_HOSTS=${VITE_ALLOWED_HOSTS}
RUN npm run build
EXPOSE 4173
CMD ["sh", "-c", "npm run preview -- --host 0.0.0.0 --port ${PORT:-4173}"]
