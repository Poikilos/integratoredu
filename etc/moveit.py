#!/usr/bin/env python
import os,os.path,shutil
bin_path = os.path.abspath(__file__)
d_path = os.path.abspath(os.path.join(bin_path, os.pardir))
m_path = os.path.abspath(os.path.join(d_path, os.pardir))
y_path = os.path.abspath(os.path.join(m_path, os.pardir))
category_path = os.path.abspath(os.path.join(y_path, os.pardir))

print("day_path: "+d_path)
#print(m_path)
print("category_path: " + category_path)
print("")
if (len(os.path.basename(y_path))!=4) or (len(os.path.basename(m_path))!=2) or (len(os.path.basename(d_path))!=2):
    print("either this is >= the year 10000 you must run this script from a day folder")
folder_path = d_path  # not ".", so as to avoid self via compare below
for sub_name in os.listdir(folder_path):
    sub_path = os.path.join(folder_path, sub_name)
    if sub_name[:1]!="." and os.path.isfile(sub_path):
        if sub_path != bin_path:
            name_no_ext = os.path.splitext(sub_name)[0]
            print(sub_name)
            change_enable = False
            with open(sub_path) as f:
                content = f.readlines()
            stated_date = None
            actual_date = None
            stated_date_i = None
            time = None
            for line_i in range(0,len(content)):
                content[line_i] = content[line_i].rstrip()  # or newlines via rstrip("\n\r")
                line = content[line_i]
                #print(line)
                op_i = line.find(":")
                if op_i >= 0:
                    v_name = line[:op_i].strip()
                    v_val = line[op_i+1:].strip()
                    if (len(v_val)>=2) and (v_val[:1]=="'") and (v_val[-1:]=="'"):
                        v_val = v_val[1:-1]
                    if v_name == "stated_date":
                        stated_date = v_val
                        stated_date_i = line_i
                    elif v_name == "ctime":
                        actual_date = v_val[:10]  # get 2018-01-01 from time
            date = None
            if stated_date is not None:
                date = stated_date
                print("  stated_date: "+stated_date)
                if stated_date==actual_date:
                    print("  info: removing same stated date")
                    content[stated_date_i] = None
                    change_enable = True
            elif actual_date is not None:
                date = actual_date
                #print("  date: "+date)
            else:
                #print("  date_missing_from: "+sub_name)
                pass
            target_item_path = None
            if date is not None:
                if (date[4:5]=="-") and (date[7:8]=="-"):
                    target_y_s = date[0:4]
                    target_m_s = date[5:7]
                    target_d_s = date[8:10]
                    target_y_path = os.path.join(category_path, target_y_s)
                    target_m_path = os.path.join(target_y_path, target_m_s)
                    target_d_path = os.path.join(target_m_path, target_d_s)
                    if (target_d_path != d_path):
                        try:
                            target_item_path = os.path.join(target_d_path, sub_name)
                            shutil.move(sub_path, target_item_path)
                            print("    - moved to "+target_d_path)
                        except:
                            print("    - could not finish moving to to "+target_d_path)
                        
                else:
                    print("    - bad date format")
            if change_enable:
                outs = None
                save_path = None
                if target_item_path is not None:
                    save_path = target_item_path
                else:
                    save_path = sub_path
                outs = open(save_path, 'w')
                print("    - resaving")
                for line_i in range(0,len(content)):
                    try:
                        if content[line_i] is not None:
                            outs.write(content[line_i] + "\n")
                        else:
                            print("    - removed line number "+str(line_i+1))
                    except:
                        print("    - could not finish writing line "+str(line_i+1))
                outs.close()
        #else:
        #    print("<the current script>")
