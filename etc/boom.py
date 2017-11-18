#!/usr/bin/env python
import os
#import time
import datetime

print("ERROR: use this script by removing exit only if you are really really sure you know what you're doing.")
exit(1)

folder_path = "."
tmp_path = os.path.join(folder_path, "tmp")
if not os.path.isdir(tmp_path):
    os.mkdir(tmp_path)
if os.path.isdir(folder_path):
    for sub_name in os.listdir(folder_path):
        sub_path = os.path.join(folder_path, sub_name)
        if sub_name[:1]!="." and os.path.isfile(sub_path) and sub_name[-4:]==".yml":
            print("Reading "+sub_path+"...")
            ins = open(sub_path, 'r')
            outs = open(os.path.join(tmp_path, sub_name), 'w')
            line = True
            counting_number = 1
            while line:
                participle = "reading line "+str(counting_number)
                line = ins.readline()
                if line:
                    if line[:5]=="time:":
                        print(line[6:])
                        hour = sub_name[:2]
                        hour_i = int(hour)
                        minute = "00"
                        if hour_i == 15:
                            minute = "10"
                        outs.write("time: '"+hour+":"+minute+":"+sub_name[4:6]+"'"+"\n")
                    else:
                        outs.write(line)
            #time.strftime('HH:mm', time.gmtime(os.path.getmtime(sub_path)))
            #stat = os.stat(sub_path)
            #mtime_stamp = stat.st_mtime
            #ctime_stamp = None
            #try:
            #    ctime_stamp = stat.st_birthtime
            #except:
            #    ctime_stamp = stat.st_ctime
            #ctime_stamp = stat.st_atime

            #try:
            #    mtime = datetime.datetime.fromtimestamp(mtime_stamp)
            #    print("typeof(ctime):"+str(type(ctime_stamp)))
            #    ctime = datetime.datetime.fromtimestamp(ctime_stamp)
            #    print("ctime:"+str(ctime))
            #    print("mtime:"+str(mtime))
            #except:
            #    print(str(stat))
            outs.close()
            ins.close()

