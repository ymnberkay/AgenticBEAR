{{/* Base name */}}
{{- define "agenticbear.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Fullname */}}
{{- define "agenticbear.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Common labels */}}
{{- define "agenticbear.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/name: {{ include "agenticbear.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* Selector labels for a component (pass dict with .ctx and .component) */}}
{{- define "agenticbear.selectorLabels" -}}
app.kubernetes.io/name: {{ include "agenticbear.name" .ctx }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/* Component resource names */}}
{{- define "agenticbear.serverName" -}}{{ include "agenticbear.fullname" . }}-server{{- end -}}
{{- define "agenticbear.postgresName" -}}{{ include "agenticbear.fullname" . }}-postgres{{- end -}}
{{- define "agenticbear.qdrantName" -}}{{ include "agenticbear.fullname" . }}-qdrant{{- end -}}
{{- define "agenticbear.secretName" -}}{{ include "agenticbear.fullname" . }}-secret{{- end -}}
{{- define "agenticbear.configName" -}}{{ include "agenticbear.fullname" . }}-config{{- end -}}

{{/* image ref */}}
{{- define "agenticbear.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}

{{/* Resolved DATABASE_URL (bundled or external) */}}
{{- define "agenticbear.databaseUrl" -}}
{{- if .Values.postgres.enabled -}}
{{- printf "postgres://%s:%s@%s:%d/%s" .Values.postgres.username .Values.postgres.password (include "agenticbear.postgresName" .) (int .Values.postgres.port) .Values.postgres.database -}}
{{- else -}}
{{- required "externalDatabase.url is required when postgres.enabled=false" .Values.externalDatabase.url -}}
{{- end -}}
{{- end -}}

{{/* Resolved Qdrant URL (bundled or external) */}}
{{- define "agenticbear.qdrantUrl" -}}
{{- if .Values.qdrant.enabled -}}
{{- printf "http://%s:%d" (include "agenticbear.qdrantName" .) (int .Values.qdrant.httpPort) -}}
{{- else -}}
{{- .Values.qdrant.externalUrl -}}
{{- end -}}
{{- end -}}
