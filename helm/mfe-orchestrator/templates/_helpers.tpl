{{/*
Expand the name of the chart.
*/}}
{{- define "mfe-orchestrator.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name, truncated to the 63 chars a DNS name allows.
*/}}
{{- define "mfe-orchestrator.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart name and version, as used by the chart label.
*/}}
{{- define "mfe-orchestrator.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "mfe-orchestrator.labels" -}}
helm.sh/chart: {{ include "mfe-orchestrator.chart" . }}
{{ include "mfe-orchestrator.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "mfe-orchestrator.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mfe-orchestrator.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Name of the service account to use.
*/}}
{{- define "mfe-orchestrator.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "mfe-orchestrator.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Name of the PersistentVolumeClaim holding the uploaded microfrontends.
*/}}
{{- define "mfe-orchestrator.pvcName" -}}
{{- if .Values.persistence.existingClaim }}
{{- .Values.persistence.existingClaim }}
{{- else }}
{{- printf "%s-microfrontends" (include "mfe-orchestrator.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Folder the microfrontends are stored in: persistence.mountPath wins, otherwise
the value of MICROFRONTEND_HOST_FOLDER, otherwise the application default.
*/}}
{{- define "mfe-orchestrator.microfrontendFolder" -}}
{{- $fromEnv := "" }}
{{- with .Values.env }}
{{- $fromEnv = default "" (get . "MICROFRONTEND_HOST_FOLDER") }}
{{- end }}
{{- default (default "/upload-microfrontends" $fromEnv) .Values.persistence.mountPath }}
{{- end }}

{{/*
Environment variables of a values map, filtered and quoted, as "KEY: value"
lines. Empty strings and nulls are dropped so that the application keeps its
own defaults instead of receiving an empty variable.
Usage: include "mfe-orchestrator.envEntries" .Values.env
*/}}
{{- define "mfe-orchestrator.envEntries" -}}
{{- range $key, $value := . }}
{{- if not (kindIs "invalid" $value) }}
{{- if ne (toString $value) "" }}
{{ $key }}: {{ toString $value | quote }}
{{- end }}
{{- end }}
{{- end }}
{{- end }}

{{/*
True when the given map has at least one usable entry.
*/}}
{{- define "mfe-orchestrator.hasEnvEntries" -}}
{{- $found := "" }}
{{- range $key, $value := . }}
{{- if not (kindIs "invalid" $value) }}
{{- if ne (toString $value) "" }}
{{- $found = "true" }}
{{- end }}
{{- end }}
{{- end }}
{{- $found }}
{{- end }}
