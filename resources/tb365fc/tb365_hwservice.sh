#!/system/bin/sh
export LD_LIBRARY_PATH=/mnt/system_ext/lib64:/mnt/system/system/lib64/bootstrap:/mnt/system/system/lib64
exec /skyware/bin/hwservicemanager
